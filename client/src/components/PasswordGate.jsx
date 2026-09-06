import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuction } from '../lib/auction.jsx';

// The projector and the viewer page are always open — no password to watch.
const OPEN_PATHS = new Set(['/watch', '/display']);

/**
 * One door for everyone. A single password field: the server works out from
 * the password whether you are a team owner (and which team) or the
 * auctioneer, and the room arranges itself accordingly.
 *
 * Locked links narrow the door: /control accepts only the auctioneer's
 * password, /bid/<team> only that team's.
 */
export default function PasswordGate({ children }) {
  const { role, authKey, login, myTeam, teamId, setRole, locked } = useAuction();
  const loc = useLocation();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const open = OPEN_PATHS.has(loc.pathname) || role === 'spectator';
  if (authKey || open) return children;

  const adminOnly = locked && role === 'admin';
  const teamOnly = locked && role === 'owner';

  const title = adminOnly ? 'Auctioneer'
    : teamOnly ? (myTeam ? myTeam.name : 'Team owner')
      : 'Welcome';
  const blurb = adminOnly ? 'Enter the auctioneer\'s password to take the hammer.'
    : teamOnly ? 'Enter your team\'s password to pick up the paddle.'
      : 'One password is all it takes — it knows whether you hold a paddle or the hammer.';

  const submit = async (e) => {
    e.preventDefault();
    if (!pw.trim() || busy) return;
    setBusy(true);
    setErr('');
    const constraint = adminOnly ? { role: 'admin' } : teamOnly ? { role: 'owner', teamId } : null;
    const res = await login(pw.trim(), constraint);
    setBusy(false);
    if (!res.ok) setErr(res.error || 'Wrong password.');
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="eyebrow">The Saleroom</div>
        <h2 className="gate-title">{title}</h2>
        <p className="small muted" style={{ margin: '0 0 14px' }}>{blurb}</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(''); }}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          style={{ width: '100%', fontSize: 16, padding: '12px 14px' }}
        />
        {err ? <p className="small" style={{ color: 'var(--oxblood)', margin: '10px 0 0', fontWeight: 600 }}>{err}</p> : null}
        <button className="btn primary" type="submit" disabled={!pw.trim() || busy}
          style={{ width: '100%', marginTop: 14, padding: '12px' }}>
          {busy ? 'Checking…' : 'Enter the saleroom'}
        </button>
        <button type="button" className="btn ghost sm" style={{ width: '100%', marginTop: 8 }}
          onClick={() => setRole('spectator')}>
          Just watching — no password needed
        </button>
      </form>
    </div>
  );
}
