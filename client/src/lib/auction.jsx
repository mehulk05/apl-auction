import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const Ctx = createContext(null);

const ROLE_KEY = 'auction.role';
const TEAM_KEY = 'auction.teamId';
const PINNED_KEY = 'auction.pinned';
const LOCKED_KEY = 'auction.locked';
const AUTH_KEY = 'auction.key';

/**
 * Who is this tab?
 *
 * localStorage is shared by every tab in a browser, so without this a second tab
 * would silently steal the first tab's identity. A tab opened with ?role=/?team=
 * is "pinned": it keeps its identity in sessionStorage, which is per-tab, so one
 * browser can run the auctioneer and several owners side by side.
 */
function resolveIdentity() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;

  let urlRole = params.get('role');
  let urlTeam = params.get('team');
  let teamKey = '';
  let locked = false;

  // Shareable, role-locked paths: /control (auctioneer), /bid/<team> (owner),
  // /watch (viewer). These hide the role switcher entirely — one link per person.
  const bid = path.match(/^\/bid\/([^/]+)/i);
  if (bid) { urlRole = 'owner'; teamKey = decodeURIComponent(bid[1]); locked = true; }
  else if (/^\/control(\/|$)/i.test(path)) { urlRole = 'admin'; locked = true; }
  else if (/^\/watch(\/|$)/i.test(path)) { urlRole = 'spectator'; locked = true; }

  let pinned = false;
  try {
    pinned = sessionStorage.getItem(PINNED_KEY) === '1';
    locked = locked || sessionStorage.getItem(LOCKED_KEY) === '1';
  } catch (_) { /* private mode */ }

  if (urlRole || urlTeam) {
    pinned = true;
    try {
      sessionStorage.setItem(PINNED_KEY, '1');
      if (locked) sessionStorage.setItem(LOCKED_KEY, '1');
    } catch (_) { /* ignore */ }
  }

  const store = pinned ? sessionStorage : localStorage;
  const read = (k) => { try { return store.getItem(k); } catch (_) { return null; } };

  const urlKey = params.get('key');
  if (urlKey) { try { store.setItem(AUTH_KEY, urlKey); } catch (_) { /* ignore */ } }

  return {
    store,
    pinned,
    locked,
    teamKey,
    role: urlRole || read(ROLE_KEY) || '',
    teamId: urlTeam || read(TEAM_KEY) || '',
    key: urlKey || read(AUTH_KEY) || '',
  };
}

export function cr(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  const s = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
  return `₹${s} Cr`;
}

export function clockTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function AuctionProvider({ children }) {
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const identity = useRef(resolveIdentity()).current;
  const [role, setRole] = useState(identity.role);
  const [teamId, setTeamId] = useState(identity.teamId);
  const [authKey, setAuthKeyState] = useState(identity.key);
  const authKeyRef = useRef(identity.key);
  const setAuthKey = useCallback((k) => {
    authKeyRef.current = k;
    setAuthKeyState(k);
    try {
      if (k) identity.store.setItem(AUTH_KEY, k);
      else identity.store.removeItem(AUTH_KEY);
    } catch (_) { /* ignore */ }
  }, [identity]);
  const socketRef = useRef(null);
  const toastId = useRef(0);

  const pushToast = useCallback((text, kind = 'info', title = '') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-4), { id, text, kind, title }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 4000);
  }, []);

  useEffect(() => {
    // Default transport order (long-poll, then upgrade to WebSocket) — forcing
    // 'websocket' first throws a console error on any proxy that blocks the
    // upgrade, even though the fallback works fine.
    const socket = io({ reconnectionDelay: 400 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // On (re)connect always pull the authoritative full snapshot.
      socket.emit('request:snapshot', null, (res) => { if (res && res.snapshot) setSnapshot(res.snapshot); });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('snapshot', (snap) => setSnapshot(snap));
    socket.on('auction:event', (ev) => {
      if (!ev) return;
      if (ev.type === 'PLAYER_SOLD') {
        pushToast(`${ev.playerName} → ${ev.teamName} for ${cr(ev.amount)}`, 'gold', 'SOLD');
      } else if (ev.type === 'PLAYER_UNSOLD') {
        pushToast(`${ev.playerName} went unsold`, 'err', 'UNSOLD');
      } else if (ev.type === 'BID_PLACED') {
        pushToast(`${ev.teamName} bid ${cr(ev.amount)}`, 'ok');
      } else if (ev.type === 'BID_REJECTED') {
        pushToast(ev.error || 'Bid rejected', 'err', 'Bid rejected');
      } else if (ev.type === 'PLAYER_SELECTED') {
        pushToast(`${ev.playerName} is up next`, 'info');
      }
    });

    return () => socket.close();
  }, [pushToast]);

  useEffect(() => {
    try {
      identity.store.setItem(ROLE_KEY, role);
      identity.store.setItem(TEAM_KEY, teamId);
    } catch (_) { /* storage unavailable — the tab still works for this session */ }
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('identify', { role, teamId });
    }
  }, [role, teamId, identity]);

  /** Fire an action at the server; resolves with { ok, message } | { ok:false, error }. */
  const action = useCallback((type, payload = {}, opts = {}) => new Promise((resolve) => {
    const socket = socketRef.current;
    const done = (res) => {
      if (res && res.ok) {
        if (!opts.quiet && res.message) pushToast(res.message, 'ok');
      } else if (res) {
        if (res.code === 'UNAUTHORIZED' && authKeyRef.current) {
          // The password changed on the server (e.g. after a redeploy) - drop
          // the stale one so the sign-in screen comes back instead of every
          // button failing with "wrong password".
          setAuthKey('');
          pushToast('Your password is no longer valid here - sign in again.', 'err', 'Signed out');
        } else {
          pushToast(res.error || 'Action failed', 'err');
        }
      }
      resolve(res || { ok: false, error: 'No response' });
    };

    const key = authKeyRef.current;
    if (socket && socket.connected) {
      socket.timeout(8000).emit('action', { type, payload, key }, (err, res) => {
        if (err) return done({ ok: false, error: 'Server did not respond in time' });
        done(res);
      });
      return;
    }
    // Fallback to REST when the socket is down.
    fetch('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, key }),
    }).then((r) => r.json()).then(done).catch((e) => done({ ok: false, error: e.message }));
  }), [pushToast, setAuthKey]);

  const login = useCallback(async (password, constraint) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(constraint ? { password, ...constraint } : { password }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthKey(password);
        if (data.role) setRole(data.role);
        setTeamId(data.teamId || '');
      }
      return data;
    } catch (e) {
      return { ok: false, error: 'Could not reach the server: ' + e.message };
    }
  }, [setAuthKey]);

  useEffect(() => {
    if (!snapshot || !identity.teamKey) return;
    const key = identity.teamKey.toLowerCase();
    const hit = snapshot.teams.find((t) =>
      t.id.toLowerCase() === key || t.name.toLowerCase().replace(/\s+/g, '-') === key);
    if (hit && teamId !== hit.id) setTeamId(hit.id);
  }, [snapshot, identity, teamId]);

  const myTeam = useMemo(() => {
    if (!snapshot || role !== 'owner') return null;
    return snapshot.teams.find((t) => t.id === teamId) || null;
  }, [snapshot, role, teamId]);

  const value = useMemo(() => ({
    snapshot, connected, action, toasts, pushToast,
    role, setRole, teamId, setTeamId, myTeam,
    isAdmin: role === 'admin',
    pinned: identity.pinned,
    locked: identity.locked,
    authKey, login,
    logout: () => { setAuthKey(''); setRole(''); setTeamId(''); },
  }), [snapshot, connected, action, toasts, pushToast, role, teamId, myTeam, identity, authKey, login, setAuthKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuction() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuction must be used inside <AuctionProvider>');
  return v;
}
