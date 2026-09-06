'use strict';
/**
 * End-to-end tests against a real server process: multiple Socket.IO clients,
 * live broadcast, simultaneous bidding, reconnect resync, REST + CSV endpoints.
 *   node tests/integration.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { parseCsv } = require('../src/csv');

const PORT = Number(process.env.TEST_PORT) || 3199;
const BASE = `http://localhost:${PORT}`;

let pass = 0; let fail = 0; const failures = [];
let currentGroup = null;

function group(name) { currentGroup = name; console.log(`\n\x1b[1m${name}\x1b[0m`); }

async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    fail++;
    failures.push({ group: currentGroup, name, err });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`     ${String(err.message).split('\n')[0]}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connect a client and resolve once it holds the first snapshot. */
function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ['websocket'], reconnection: true, reconnectionDelay: 150 });
    const client = { label, socket, snapshot: null, events: [], snapshotCount: 0 };
    socket.on('snapshot', (s) => { client.snapshot = s; client.snapshotCount++; });
    socket.on('auction:event', (e) => client.events.push(e));
    socket.on('connect_error', reject);
    socket.on('connect', () => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (client.snapshot) { clearInterval(poll); resolve(client); }
        else if (Date.now() - started > 5000) { clearInterval(poll); reject(new Error('no snapshot after connect')); }
      }, 20);
    });
  });
}

/** Send an action over the socket and resolve with the server's ack. */
function act(client, type, payload = {}, key) {
  return new Promise((resolve) => {
    client.socket.timeout(8000).emit('action', { type, payload, key: key === undefined ? ADMIN : key }, (err, res) => {
      resolve(err ? { ok: false, error: 'timeout' } : res);
    });
  });
}

async function api(pathname, options) {
  const res = await fetch(BASE + pathname, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* csv or html */ }
  return { status: res.status, json, text, headers: res.headers };
}

/** Wait until every client's snapshot satisfies the predicate. */
async function settle(clients, predicate, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (clients.every((c) => c.snapshot && predicate(c.snapshot))) return true;
    await wait(30);
  }
  throw new Error('clients did not converge on the expected state in time');
}

let child = null;
let dataDir = null;
let ADMIN = '';
let TEAMKEYS = {};

async function startServer() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-int-'));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), AUCTION_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await api('/api/health');
      if (r.status === 200 && r.json && r.json.ok) {
        const auth = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));
        ADMIN = auth.admin;
        TEAMKEYS = auth.teams;
        return;
      }
    } catch (_) { /* not up yet */ }
    await wait(150);
  }
  throw new Error('server did not start in time');
}

function stopServer() {
  if (child) child.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
}

(async () => {
  console.log('\n\x1b[1m=== IPL AUCTION — LIVE SERVER / MULTI-CLIENT TESTS ===\x1b[0m');
  await startServer();

  const admin = await connect('admin');
  const owner1 = await connect('owner-warriors');
  const owner2 = await connect('owner-titans');
  const display = await connect('display');
  const all = [admin, owner1, owner2, display];

  // ------------------------------------------------------------------
  group('1. Server, snapshots & multi-client connection');
  await t('health endpoint responds', async () => {
    const r = await api('/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
  });
  await t('4 clients each received a full snapshot on connect', () => {
    for (const c of all) {
      assert.ok(c.snapshot, `${c.label} has no snapshot`);
      assert.strictEqual(c.snapshot.players.length, 64);
      assert.strictEqual(c.snapshot.teams.length, 6);
    }
  });
  await t('the snapshot carries everything a reconnecting client needs', () => {
    const s = admin.snapshot;
    for (const key of ['settings', 'categories', 'state', 'players', 'teams', 'stats', 'history', 'undo', 'currentPlayer']) {
      assert.ok(key in s, `snapshot is missing "${key}"`);
    }
    for (const key of ['status', 'currentBid', 'nextBid', 'highestBidderTeamId', 'round', 'bidHistory']) {
      assert.ok(key in s.state, `state is missing "${key}"`);
    }
    assert.ok('maxAllowedBid' in s.teams[0] && 'squad' in s.teams[0] && 'canBid' in s.teams[0]);
  });
  await t('GET /api/state returns the same authoritative snapshot', async () => {
    const r = await api('/api/state');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.players.length, 64);
    assert.strictEqual(r.json.state.status, admin.snapshot.state.status);
  });

  // ------------------------------------------------------------------
  group('2. Live broadcast — everyone sees the same thing');
  await t('START_AUCTION reaches all 4 clients without a refresh', async () => {
    const r = await act(admin, 'START_AUCTION');
    assert.strictEqual(r.ok, true, r.error);
    await settle(all, (s) => s.state.started === true);
  });
  await t('the selected player appears identically on every screen', async () => {
    const r = await act(admin, 'SELECT_PLAYER', { playerId: 'P001' });
    assert.strictEqual(r.ok, true, r.error);
    await settle(all, (s) => s.state.currentPlayerId === 'P001');
    const names = all.map((c) => c.snapshot.currentPlayer.name);
    assert.deepStrictEqual(names, ['Rahul Sharma', 'Rahul Sharma', 'Rahul Sharma', 'Rahul Sharma']);
    all.forEach((c) => assert.strictEqual(c.snapshot.state.status, 'PLAYER_SELECTED'));
  });
  await t('a PLAYER_SELECTED event was pushed to every client', () => {
    all.forEach((c) => assert.ok(c.events.some((e) => e.type === 'PLAYER_SELECTED' && e.playerId === 'P001'), c.label));
  });
  await t('owners cannot bid until the auctioneer opens bidding', async () => {
    const r = await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 5 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'NOT_BIDDING');
  });
  await t('after START_BIDDING every client shows the same next valid bid', async () => {
    await act(admin, 'START_BIDDING');
    await settle(all, (s) => s.state.status === 'BIDDING');
    all.forEach((c) => assert.strictEqual(c.snapshot.state.nextBid, 5, c.label));
  });
  await t('one owner bids -> all screens show the bid and the bidder', async () => {
    const r = await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 5 });
    assert.strictEqual(r.ok, true, r.error);
    await settle(all, (s) => s.state.currentBid === 5);
    all.forEach((c) => {
      assert.strictEqual(c.snapshot.state.highestBidderTeamId, 'T001', c.label);
      assert.strictEqual(c.snapshot.state.highestBidderName, 'Warriors', c.label);
      assert.strictEqual(c.snapshot.state.nextBid, 6, c.label);
    });
  });
  await t('the rival owner bids 6 -> leader flips on every screen', async () => {
    const r = await act(owner2, 'PLACE_BID', { teamId: 'T002', amount: 6 });
    assert.strictEqual(r.ok, true, r.error);
    await settle(all, (s) => s.state.currentBid === 6 && s.state.highestBidderName === 'Titans');
    display.snapshot.teams.forEach((tm) => {
      if (tm.id === 'T002') assert.strictEqual(tm.id === display.snapshot.state.highestBidderTeamId, true);
    });
  });
  await t('a rejected bid notifies only the bidder that tried it', async () => {
    const before = owner1.events.length;
    const r = await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 5 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'STALE_BID');
    assert.strictEqual(r.error, 'Bid rejected. Current bid is already 6 Cr. Next valid bid is 7 Cr.');
    await wait(200);
    assert.ok(owner1.events.slice(before).some((e) => e.type === 'BID_REJECTED'), 'bidder got no BID_REJECTED');
    assert.ok(!owner2.events.some((e) => e.type === 'BID_REJECTED'), 'rival should not see the rejection');
  });

  // ------------------------------------------------------------------
  group('3. Race conditions — simultaneous bids over the wire');
  await t('2 clients firing the identical next bid -> exactly 1 wins', async () => {
    const target = admin.snapshot.state.nextBid;
    const [a, b] = await Promise.all([
      act(owner1, 'PLACE_BID', { teamId: 'T001', amount: target }),
      act(owner2, 'PLACE_BID', { teamId: 'T002', amount: target }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert.strictEqual(winners.length, 1, `expected 1 winner, got ${winners.length}`);
    assert.strictEqual(losers.length, 1);
    assert.ok(['STALE_BID', 'ALREADY_HIGHEST'].includes(losers[0].code), losers[0].code);
    await settle([admin], (s) => s.state.currentBid === target);
  });
  await t('the loser is told the current bid and the next valid bid', async () => {
    const target = admin.snapshot.state.nextBid;
    const holder = admin.snapshot.state.highestBidderTeamId;
    const challenger = holder === 'T001' ? owner2 : owner1;
    const challengerTeam = holder === 'T001' ? 'T002' : 'T001';
    await act(challenger, 'PLACE_BID', { teamId: challengerTeam, amount: target });
    const stale = await act(challenger === owner1 ? owner2 : owner1, 'PLACE_BID', { teamId: holder, amount: target });
    assert.strictEqual(stale.ok, false);
    assert.match(stale.error, /Current bid is already \d+ Cr\. Next valid bid is \d+ Cr\./);
  });
  await t('6 teams stampede the same amount -> 1 accepted, 5 rejected, ladder intact', async () => {
    const clients = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => connect(`stampede-${i}`)));
    const teams = ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'];
    const target = admin.snapshot.state.nextBid;
    const results = await Promise.all(clients.map((c, i) => act(c, 'PLACE_BID', { teamId: teams[i], amount: target })));
    const ok = results.filter((r) => r.ok);
    assert.strictEqual(ok.length, 1, `expected exactly 1 accepted bid, got ${ok.length}`);
    await settle([admin], (s) => s.state.currentBid === target);
    const ladder = admin.snapshot.state.bidHistory.filter((b) => b.amount === target);
    assert.strictEqual(ladder.length, 1, `ladder has ${ladder.length} entries for ${target} Cr`);
    clients.forEach((c) => c.socket.close());
  });
  await t('the bid ladder never contains a duplicate amount', () => {
    const amounts = admin.snapshot.state.bidHistory.map((b) => b.amount);
    assert.strictEqual(new Set(amounts).size, amounts.length, JSON.stringify(amounts));
  });

  // ------------------------------------------------------------------
  group('4. SOLD over the wire');
  await t('SOLD updates player, purse and squad for every client at once', async () => {
    const price = admin.snapshot.state.currentBid;
    const winnerId = admin.snapshot.state.highestBidderTeamId;
    const before = admin.snapshot.teams.find((tm) => tm.id === winnerId);
    const purseBefore = before.purse;

    const r = await act(admin, 'MARK_SOLD');
    assert.strictEqual(r.ok, true, r.error);
    await settle(all, (s) => s.state.status === 'SOLD');

    for (const c of all) {
      const tm = c.snapshot.teams.find((x) => x.id === winnerId);
      const p = c.snapshot.players.find((x) => x.id === 'P001');
      assert.strictEqual(p.status, 'SOLD', c.label);
      assert.strictEqual(p.teamId, winnerId, c.label);
      assert.strictEqual(p.soldPrice, price, c.label);
      assert.strictEqual(tm.purse, purseBefore - price, c.label);
      assert.strictEqual(tm.squadSize, 1, c.label);
      assert.strictEqual(c.snapshot.state.currentPlayerId, '', c.label);
    }
  });
  await t('a PLAYER_SOLD event was broadcast to all clients', () => {
    all.forEach((c) => assert.ok(c.events.some((e) => e.type === 'PLAYER_SOLD' && e.playerId === 'P001'), c.label));
  });
  await t('the sale is in the activity log with a timestamp', () => {
    const entry = admin.snapshot.history.find((h) => h.action === 'PLAYER_SOLD');
    assert.ok(entry);
    assert.ok(!Number.isNaN(Date.parse(entry.ts)));
    assert.match(entry.message, /SOLD to/);
  });

  // ------------------------------------------------------------------
  group('5. Reconnect & full state resync');
  await t('a client that misses updates while offline resyncs completely', async () => {
    owner2.socket.disconnect();
    await wait(200);
    assert.strictEqual(owner2.socket.connected, false);

    // Auction moves on while owner2 is dark.
    await act(admin, 'SELECT_PLAYER', { playerId: 'P009' });
    await act(admin, 'START_BIDDING');
    await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 3 });
    await settle([admin], (s) => s.state.currentPlayerId === 'P009' && s.state.currentBid === 3);

    const staleCount = owner2.snapshotCount;
    owner2.socket.connect();
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (owner2.socket.connected && owner2.snapshotCount > staleCount
        && owner2.snapshot.state.currentPlayerId === 'P009') break;
      await wait(40);
    }
    assert.strictEqual(owner2.socket.connected, true, 'client did not reconnect');
    assert.strictEqual(owner2.snapshot.state.currentPlayerId, 'P009');
    assert.strictEqual(owner2.snapshot.state.currentBid, 3);
    assert.strictEqual(owner2.snapshot.state.highestBidderName, 'Warriors');
    assert.strictEqual(owner2.snapshot.players.find((p) => p.id === 'P001').status, 'SOLD');
    assert.strictEqual(owner2.snapshot.stats.sold, 1);
  });
  await t('an explicit snapshot request returns the live state', async () => {
    const snap = await new Promise((resolve) => {
      owner2.socket.emit('request:snapshot', null, (res) => resolve(res.snapshot));
    });
    assert.strictEqual(snap.state.currentPlayerId, 'P009');
    assert.strictEqual(snap.state.currentBid, 3);
  });

  // ------------------------------------------------------------------
  group('6. REST fallback, exports & persistence');
  await t('POST /api/action works when a client has no socket', async () => {
    const r = await api('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PLACE_BID', payload: { teamId: 'T002', amount: 4 }, key: TEAMKEYS.T002 }),
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    await settle(all, (s) => s.state.currentBid === 4 && s.state.highestBidderName === 'Titans');
  });
  await t('an invalid action over REST returns 409 with a reason', async () => {
    const r = await api('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PLACE_BID', payload: { teamId: 'T002', amount: 99 }, key: TEAMKEYS.T002 }),
    });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.json.ok, false);
    assert.ok(r.json.code);
  });
  await t('an unknown action is refused', async () => {
    const r = await api('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'DROP_TABLES', key: ADMIN }),
    });
    assert.strictEqual(r.json.code, 'UNKNOWN_ACTION');
  });
  await t('auction.csv downloads and parses with all record types', async () => {
    const r = await api('/api/export/auction');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /auction\.csv/);
    const { records } = parseCsv(r.text);
    assert.strictEqual(records.filter((x) => x.record_type === 'PLAYER').length, 64);
    assert.strictEqual(records.filter((x) => x.record_type === 'TEAM').length, 6);
    assert.ok(records.filter((x) => x.record_type === 'TRANSACTION').length > 0);
  });
  await t('players.csv, teams.csv, sold.csv and transactions.csv all download', async () => {
    for (const kind of ['players', 'teams', 'sold', 'transactions']) {
      const r = await api(`/api/export/${kind}`);
      assert.strictEqual(r.status, 200, kind);
      const { records } = parseCsv(r.text);
      assert.ok(records.length > 0, `${kind} is empty`);
    }
  });
  await t('backups were created on disk during the session', async () => {
    const r = await api('/api/backups');
    assert.ok(r.json.backups.length >= 2, `only ${r.json.backups.length} backups`);
    r.json.backups.forEach((b) => {
      JSON.parse(fs.readFileSync(path.join(dataDir, 'backups', b.file), 'utf8'));
    });
  });
  await t('auction.json on disk reflects the completed sale', () => {
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'auction.json'), 'utf8'));
    const p = disk.players.find((x) => x.id === 'P001');
    assert.strictEqual(p.status, 'SOLD');
    assert.ok(p.soldPrice > 0);
    assert.ok(disk.history.length > 0);
  });

  // ------------------------------------------------------------------
  group('7. Passwords — server-side authorization');
  await t('an admin action with no password is refused', async () => {
    const r = await api('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'PAUSE_AUCTION' }),
    });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.code, 'UNAUTHORIZED');
  });
  await t('a bid with no password is refused', async () => {
    const r = await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 999 }, null);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'UNAUTHORIZED');
  });
  await t("a bid with another team's password is refused", async () => {
    const r = await act(owner1, 'PLACE_BID', { teamId: 'T001', amount: 999 }, TEAMKEYS.T002);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'UNAUTHORIZED');
  });
  await t('a team password cannot run admin actions', async () => {
    const r = await act(owner1, 'PAUSE_AUCTION', {}, TEAMKEYS.T001);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'UNAUTHORIZED');
  });
  await t('login resolves a team password to its team', async () => {
    const r = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEAMKEYS.T003, role: 'owner', teamId: 'T003' }),
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.teamId, 'T003');
    const wrong = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'nope', role: 'admin' }),
    });
    assert.strictEqual(wrong.status, 401);
  });

  // ------------------------------------------------------------------
  group('8. Survives a restart (crash recovery)');
  await t('state is intact after the server process is restarted', async () => {
    const before = (await api('/api/state')).json;
    child.kill();
    await wait(700);

    child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), AUCTION_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deadline = Date.now() + 15000;
    let up = false;
    while (Date.now() < deadline && !up) {
      try { const h = await api('/api/health'); up = h.status === 200; } catch (_) { /* retry */ }
      if (!up) await wait(150);
    }
    assert.ok(up, 'server did not come back up');

    const after = (await api('/api/state')).json;
    assert.strictEqual(after.stats.sold, before.stats.sold);
    assert.deepStrictEqual(after.teams.map((tm) => tm.purse), before.teams.map((tm) => tm.purse));
    assert.strictEqual(after.players.find((p) => p.id === 'P001').soldPrice,
      before.players.find((p) => p.id === 'P001').soldPrice);
    assert.strictEqual(after.history.length, before.history.length);
  });

  all.forEach((c) => c.socket.close());
  await wait(150);

  console.log(`\n\x1b[1m─── SUMMARY ───\x1b[0m`);
  console.log(`  \x1b[32mpassed: ${pass}\x1b[0m`);
  console.log(`  ${fail ? '\x1b[31m' : ''}failed: ${fail}\x1b[0m`);
  if (fail) {
    console.log('\nFailures:');
    failures.forEach((f) => {
      console.log(`\n  [${f.group}] ${f.name}`);
      console.log(`  ${String(f.err.stack).split('\n').slice(0, 5).join('\n  ')}`);
    });
  }
  stopServer();
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\nTest harness crashed:', err);
  stopServer();
  process.exit(1);
});
