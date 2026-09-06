'use strict';
/**
 * Drives a realistic partial auction against a running server, purely over the
 * public HTTP API. Handy for demos and for eyeballing the UI with real data.
 *   node scripts/demo.js [playerCount]
 */

const BASE = process.env.BASE || 'http://localhost:3000';
const TARGET = Number(process.argv[2]) || 30;

async function act(type, payload = {}) {
  const res = await fetch(`${BASE}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  });
  return res.json();
}

const state = () => fetch(`${BASE}/api/state`).then((r) => r.json());
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

(async () => {
  let s = await state();
  if (!s.state.started) {
    console.log(await act('START_AUCTION'));
    s = await state();
  }

  let done = 0;
  let sold = 0;
  let unsold = 0;

  while (done < TARGET) {
    s = await state();
    if (!s.players.some((p) => p.status === 'AVAILABLE')) break;

    if (['PLAYER_SELECTED', 'BIDDING'].includes(s.state.status)) await act('SKIP_PLAYER');

    const r = await act('RANDOM_PLAYER', {});
    if (!r.ok) { console.log('select failed:', r.error); break; }
    await act('START_BIDDING');

    // A few rounds of competitive bidding among teams that legally can.
    let rounds = 1 + Math.floor(Math.random() * 6);
    while (rounds-- > 0) {
      s = await state();
      const eligible = s.teams.filter((t) => t.canBid);
      if (!eligible.length) break;
      const team = pick(eligible);
      const res = await act('PLACE_BID', { teamId: team.id, amount: s.state.nextBid });
      if (!res.ok) break;
    }

    s = await state();
    if (s.state.highestBidderTeamId) {
      const res = await act('MARK_SOLD');
      if (res.ok) sold++; else { await act('MARK_UNSOLD'); unsold++; }
    } else {
      await act('MARK_UNSOLD');
      unsold++;
    }
    done++;
  }

  // Give the teams that own players a captain.
  s = await state();
  for (const t of s.teams) {
    if (t.squad.length && !t.captainId) {
      await act('ASSIGN_CAPTAIN', { teamId: t.id, playerId: t.squad[0].id });
    }
  }

  s = await state();
  console.log(`\nauctioned ${done} players -> ${sold} sold, ${unsold} unsold`);
  console.log(`total spend: ${s.stats.totalSpent} Cr   highest: ${s.stats.highestPurchase ? `${s.stats.highestPurchase.player} ${s.stats.highestPurchase.price} Cr (${s.stats.highestPurchase.team})` : '-'}`);
  console.table(s.teams.map((t) => ({
    team: t.name, players: `${t.squadSize}/${t.maxSquad}`, spent: t.spent, purse: t.purse, maxBid: t.maxAllowedBid, captain: t.captainName,
  })));
})().catch((e) => { console.error(e); process.exit(1); });
