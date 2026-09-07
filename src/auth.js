'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Passwords for the public deployment. One per team plus one for the
 * auctioneer, kept in data/auth.json — generated once, stable across
 * auction resets (RESET_AUCTION rebuilds players, never passwords).
 *
 * Enforcement is server-side: PLACE_BID needs that team's password (or the
 * admin's); every other mutation needs the admin password. Reading state,
 * snapshots and CSV exports stay public — that is the spectator view.
 */

const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
const digits = (n) => String(crypto.randomInt(0, 10 ** n)).padStart(n, '0');

/**
 * Fixed passwords via the environment, for hosts with an ephemeral disk
 * (Render free wipes auth.json on every deploy). Format:
 *   AUCTION_PASSWORDS="admin=hammer-1,warriors=warriors19,titans=titans22"
 * Keys are `admin`, a team id (T001) or a team-name slug (superkings).
 * AUCTION_ADMIN_PASSWORD alone also works.
 */
function envOverrides() {
  const out = {};
  const raw = process.env.AUCTION_PASSWORDS || '';
  for (const pair of raw.split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
  }
  if (process.env.AUCTION_ADMIN_PASSWORD) out.admin = process.env.AUCTION_ADMIN_PASSWORD;
  return out;
}

/**
 * A team's password is DERIVED, not stored in a list: slug of the name plus
 * two digits hashed from the admin password. So any team — including one the
 * auctioneer adds tomorrow — gets the same password on every boot and every
 * redeploy, as long as the admin password itself is pinned. The formula lives
 * in code; the secret lives in the environment.
 */
function derivedPassword(name, adminPw) {
  const s = slug(name);
  const h = crypto.createHash('sha256').update(`${adminPw}|${s}`).digest('hex');
  return s + String(parseInt(h.slice(0, 8), 16) % 100).padStart(2, '0');
}

/** env override > password already on disk > derived from the admin password. */
function fillTeams(cfg, teams) {
  const over = envOverrides();
  let changed = false;
  for (const t of teams) {
    const want = over[t.id.toLowerCase()] || over[slug(t.name)] || cfg.teams[t.id] || derivedPassword(t.name, cfg.admin);
    if (cfg.teams[t.id] !== want) {
      cfg.teams[t.id] = want;
      changed = true;
    }
  }
  return changed;
}

function loadOrCreateAuth(dataDir, teams) {
  const file = path.join(dataDir, 'auth.json');

  let cfg = null;
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { cfg = null; }
  }
  if (!cfg || typeof cfg.teams !== 'object') {
    cfg = { admin: '', teams: {} };
  }

  // Admin first - everything else derives from it.
  const over = envOverrides();
  const admin = over.admin || cfg.admin || 'admin-' + digits(3);
  let changed = !fs.existsSync(file) || cfg.admin !== admin;
  cfg.admin = admin;

  changed = fillTeams(cfg, teams) || changed;

  if (changed) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf8');
  }
  return cfg;
}

/** May `key` perform `type` with `payload`? */
function authorize(cfg, type, payload, key) {
  if (!cfg) return { ok: true }; // auth disabled (no config) — LAN mode
  if (key && key === cfg.admin) return { ok: true, role: 'admin' };

  if (type === 'PLACE_BID') {
    const teamId = payload && payload.teamId;
    if (teamId && key && cfg.teams[teamId] === key) return { ok: true, role: 'owner', teamId };
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      error: key ? 'Wrong password for this team.' : 'This team\'s password is required to bid.',
    };
  }

  return {
    ok: false,
    code: 'UNAUTHORIZED',
    error: key ? 'Wrong password — only the auctioneer can do that.' : 'The auctioneer\'s password is required for that.',
  };
}

/** Resolve a bare password to an identity (for the login screen). */
function login(cfg, { password, role, teamId }) {
  if (!cfg) return { ok: true, role: role || 'spectator', teamId: teamId || '' };
  if (!password) return { ok: false, error: 'Enter the password.' };

  if (password === cfg.admin) {
    if (role === 'owner') return { ok: false, error: 'That is the auctioneer\'s password — open the auctioneer link instead.' };
    return { ok: true, role: 'admin', teamId: '' };
  }
  const hit = Object.entries(cfg.teams).find(([, pw]) => pw === password);
  if (hit) {
    const [ownsTeam] = hit;
    if (role === 'admin') return { ok: false, error: 'That is a team password — it does not open the auctioneer view.' };
    if (teamId && teamId !== ownsTeam) return { ok: false, error: 'That password belongs to a different team.' };
    return { ok: true, role: 'owner', teamId: ownsTeam };
  }
  return { ok: false, error: 'Wrong password.' };
}

/** A team added mid-sale gets its (derived) password immediately, not on restart. */
function syncTeams(cfg, dataDir, teams) {
  if (!cfg) return cfg;
  if (fillTeams(cfg, teams)) {
    fs.writeFileSync(path.join(dataDir, 'auth.json'), JSON.stringify(cfg, null, 2), 'utf8');
  }
  return cfg;
}

module.exports = { loadOrCreateAuth, authorize, login, syncTeams };
