'use strict';
/**
 * Business-rule tests, run straight against the auction engine.
 *   node tests/unit.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { AuctionEngine, AuctionError } = require('../src/engine');
const { combinedAuctionCsv } = require('../src/csvExport');
const { parseCsv } = require('../src/csv');

let pass = 0; let fail = 0; const failures = [];
const groups = [];
let current = null;

function group(name) { current = name; groups.push(name); console.log(`\n\x1b[1m${name}\x1b[0m`); }

async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    fail++;
    failures.push({ group: current, name, err });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`     ${err.message.split('\n')[0]}`);
  }
}

/** Assert that an action is refused, optionally with a specific code. */
async function refuses(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof AuctionError, `expected AuctionError, got ${err.name}: ${err.message}`);
    if (code) assert.strictEqual(err.code, code, `expected code ${code}, got ${err.code} (${err.message})`);
    return err;
  }
  throw new Error('expected the action to be rejected, but it succeeded');
}

const tmpDirs = [];
async function freshEngine(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-test-'));
  tmpDirs.push(dir);
  const e = new AuctionEngine({ dataDir: dir });
  await e.init();
  if (settings) await e.dispatch('UPDATE_SETTINGS', { patch: settings });
  await e.dispatch('START_AUCTION');
  return e;
}

/**
 * Sell a player to a team at an exact price. Two rival teams alternate up the
 * ladder (no team may outbid itself) and the target team places the last bid.
 */
async function sellAt(e, playerId, teamId, price) {
  await e.dispatch('SELECT_PLAYER', { playerId });
  await e.dispatch('START_BIDDING');

  const steps = [];
  for (let a = e.nextBidAmount(); a <= price; a += e.settings.bidIncrement) steps.push(a);
  if (!steps.length) throw new Error(`price ${price} is below the base price of ${playerId}`);

  const pushers = e.data.teams
    .filter((tm) => tm.id !== teamId && tm.status === 'ACTIVE'
      && e.squadSize(tm.id) < tm.maxSquad && e.maxAllowedBid(tm.id) >= price)
    .map((tm) => tm.id);
  if (steps.length > 1 && pushers.length < 2) throw new Error('not enough eligible rival teams to push the bid');

  for (let i = 0; i < steps.length; i++) {
    const bidder = i === steps.length - 1 ? teamId : pushers[i % 2];
    await e.dispatch('PLACE_BID', { teamId: bidder, amount: steps[i] });
  }
  await e.dispatch('MARK_SOLD');
}

/** Give a team N cheapest-tier players at their base price. */
async function stockTeam(e, teamId, count) {
  const price = e.minPlayerPrice();
  const cheap = e.data.players.filter((p) => p.status === 'AVAILABLE' && p.basePrice === price);
  for (let i = 0; i < count; i++) {
    const p = cheap[i];
    await e.dispatch('SELECT_PLAYER', { playerId: p.id });
    await e.dispatch('START_BIDDING');
    await e.dispatch('PLACE_BID', { teamId, amount: price });
    await e.dispatch('MARK_SOLD');
  }
}

(async () => {
  console.log('\n\x1b[1m=== IPL AUCTION — BUSINESS RULE TESTS ===\x1b[0m');

  // ============================================================ setup
  group('1. Setup & seed data');
  {
    const e = await freshEngine();
    await t('64 players and 6 teams are seeded', () => {
      assert.strictEqual(e.data.players.length, 64);
      assert.strictEqual(e.data.teams.length, 6);
    });
    await t('every team starts with a 75 Cr purse, 11 min / 14 max squad', () => {
      for (const tm of e.data.teams) {
        assert.strictEqual(tm.purse, 75);
        assert.strictEqual(tm.startingPurse, 75);
        assert.strictEqual(tm.minSquad, 11);
        assert.strictEqual(tm.maxSquad, 14);
      }
    });
    await t('two tiers only: A+ opens at 5 Cr, A at 2 Cr, every player priced by tier', () => {
      const price = (c) => e.data.categories.find((x) => x.name === c).basePrice;
      for (const p of e.data.players) {
        assert.strictEqual(p.basePrice, price(p.primaryCategory), `${p.name} (${p.primaryCategory})`);
      }
      assert.strictEqual(e.data.categories.length, 2);
      assert.strictEqual(price('A+'), 5);
      assert.strictEqual(price('A'), 2);
      assert.strictEqual(e.data.players.filter((p) => p.primaryCategory === 'A+').length, 8);
      assert.strictEqual(e.data.players.filter((p) => p.primaryCategory === 'A').length, 56);
    });
    await t('auction starts in WAITING with no current player', () => {
      assert.strictEqual(e.state.status, 'WAITING');
      assert.strictEqual(e.state.currentPlayerId, '');
      assert.strictEqual(e.state.currentBid, null);
    });
  }

  // ============================================================ state machine
  group('2. State machine — invalid actions are blocked');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-test-'));
    tmpDirs.push(dir);
    const e = new AuctionEngine({ dataDir: dir });
    await e.init();

    await t('cannot select a player before the auction is started', async () => {
      await refuses(e.dispatch('SELECT_PLAYER', { playerId: 'P001' }), 'NOT_STARTED');
    });
    await t('cannot bid before the auction is started', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 }), 'NOT_BIDDING');
    });

    await e.dispatch('START_AUCTION');
    await t('cannot start the auction twice', async () => {
      await refuses(e.dispatch('START_AUCTION'), 'ALREADY_STARTED');
    });
    await t('cannot bid when no player is selected', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 }), 'NOT_BIDDING');
    });
    await t('cannot start bidding without a selected player', async () => {
      await refuses(e.dispatch('START_BIDDING'), 'NO_PLAYER_SELECTED');
    });

    await e.dispatch('SELECT_PLAYER', { playerId: 'P001' });
    await t('cannot bid while state is PLAYER_SELECTED (bidding not opened yet)', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 }), 'NOT_BIDDING');
    });
    await t('cannot select a second player while one is in the auction', async () => {
      await refuses(e.dispatch('SELECT_PLAYER', { playerId: 'P002' }), 'PLAYER_IN_AUCTION');
    });
    await t('only one player is ever IN_AUCTION', () => {
      assert.strictEqual(e.data.players.filter((p) => p.status === 'IN_AUCTION').length, 1);
    });

    await e.dispatch('START_BIDDING');
    await t('cannot mark SOLD with no bids', async () => {
      await refuses(e.dispatch('MARK_SOLD'), 'NO_BIDDER');
    });

    await e.dispatch('PAUSE_AUCTION');
    await t('cannot bid while the auction is PAUSED', async () => {
      const err = await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 }), 'PAUSED');
      assert.match(err.message, /paused/i);
    });
    await t('cannot mark SOLD while paused', async () => {
      await refuses(e.dispatch('MARK_SOLD'), 'PAUSED');
    });
    await e.dispatch('RESUME_AUCTION');
    await t('resume returns to BIDDING', () => assert.strictEqual(e.state.status, 'BIDDING'));

    await e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 });
    await e.dispatch('MARK_SOLD');
    await t('cannot re-auction an already sold player', async () => {
      await refuses(e.dispatch('SELECT_PLAYER', { playerId: 'P001' }), 'ALREADY_SOLD');
    });
    await t('cannot bid once the player is SOLD', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T002', amount: 6 }), 'NOT_BIDDING');
    });
  }

  // ============================================================ bid increments
  group('3. Bid increments — 1 Cr steps only');
  {
    const e = await freshEngine();
    await e.dispatch('SELECT_PLAYER', { playerId: 'P001' }); // A+, base 5
    await e.dispatch('START_BIDDING');

    await t('first valid bid equals the base price (5 Cr)', () => {
      assert.strictEqual(e.nextBidAmount(), 5);
    });
    await t('a fractional bid of 5.5 Cr is rejected', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5.5 }), 'BAD_INCREMENT');
    });
    await t('skipping ahead to 7 Cr is rejected', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 7 }), 'BAD_INCREMENT');
    });
    await t('bidding below the base price is rejected', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 4 }), 'BAD_INCREMENT');
    });

    await e.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 });
    await t('after 5 Cr, the only valid bid is 6 Cr', () => assert.strictEqual(e.nextBidAmount(), 6));
    await t('the same team cannot outbid itself', async () => {
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 6 }), 'ALREADY_HIGHEST');
    });
    await t('a stale bid gets the spec rejection message', async () => {
      const err = await refuses(e.dispatch('PLACE_BID', { teamId: 'T002', amount: 5 }), 'STALE_BID');
      assert.strictEqual(err.message, 'Bid rejected. Current bid is already 5 Cr. Next valid bid is 6 Cr.');
    });
    await e.dispatch('PLACE_BID', { teamId: 'T002', amount: 6 });
    await t('highest bidder switches to the new team', () => {
      assert.strictEqual(e.state.highestBidderTeamId, 'T002');
      assert.strictEqual(e.state.currentBid, 6);
    });

    const e2 = await freshEngine({ bidIncrement: 2 });
    await e2.dispatch('SELECT_PLAYER', { playerId: 'P001' });
    await e2.dispatch('START_BIDDING');
    await e2.dispatch('PLACE_BID', { teamId: 'T001', amount: 5 });
    await t('a configurable increment (2 Cr) is honoured', () => {
      assert.strictEqual(e2.nextBidAmount(), 7);
    });
  }

  // ============================================================ max bid
  group('4. Maximum allowed bid & minimum-squad protection');
  {
    const e = await freshEngine();
    await t('an empty team can bid purse - (min-1) x cheapest = 75 - 10x2 = 55 Cr', () => {
      assert.strictEqual(e.maxAllowedBid('T001'), 55);
    });

    // Recreate the spec's own worked example: 28 Cr purse, 7 players, min 11.
    await stockTeam(e, 'T001', 7);
    await e.dispatch('ADJUST_PURSE', { teamId: 'T001', purse: 28 });
    await t('28 Cr purse, 7 players -> corrected reserve (3 x 2 Cr) gives 22 Cr', () => {
      assert.strictEqual(e.squadSize('T001'), 7);
      assert.strictEqual(e.team('T001').purse, 28);
      assert.strictEqual(e.maxAllowedBid('T001'), 22);
    });
    await e.dispatch('UPDATE_SETTINGS', { patch: { reserveMode: 'spec' } });
    await t('the literal spec formula reserves one extra: 28 - 4x2 = 20 Cr', () => {
      assert.strictEqual(e.maxAllowedBid('T001'), 20);
    });
    await e.dispatch('UPDATE_SETTINGS', { patch: { reserveMode: 'corrected' } });

    await t('a bid above the max allowed bid is rejected server-side', async () => {
      await e.dispatch('SELECT_PLAYER', { playerId: 'P001' });
      await e.dispatch('START_BIDDING');
      // Walk rivals up to 22; T001's ceiling is 22, so 23 must be refused.
      let amt = e.nextBidAmount();
      while (amt < 23) { await e.dispatch('PLACE_BID', { teamId: amt % 2 ? 'T002' : 'T003', amount: amt }); amt++; }
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 23 }), 'MIN_SQUAD_PROTECTION');
      await e.dispatch('MARK_UNSOLD');
    });

    // The endgame the literal spec formula breaks: 10 players, 1 Cr left.
    const e2 = await freshEngine();
    await stockTeam(e2, 'T001', 10);
    await e2.dispatch('ADJUST_PURSE', { teamId: 'T001', purse: 2 });
    await t('endgame: 10 players + exactly one cheapest lot of purse CAN buy the 11th (corrected)', async () => {
      assert.strictEqual(e2.maxAllowedBid('T001'), 2);
      const cheap = e2.data.players.find((p) => p.status === 'AVAILABLE' && p.basePrice === 2);
      await e2.dispatch('SELECT_PLAYER', { playerId: cheap.id });
      await e2.dispatch('START_BIDDING');
      await e2.dispatch('PLACE_BID', { teamId: 'T001', amount: 2 });
      await e2.dispatch('MARK_SOLD');
      assert.strictEqual(e2.squadSize('T001'), 11);
      assert.strictEqual(e2.team('T001').purse, 0);
    });
    await t('the literal spec formula would have stranded that team at 0 Cr max bid', async () => {
      const e3 = await freshEngine({ reserveMode: 'spec' });
      await stockTeam(e3, 'T001', 10);
      await e3.dispatch('ADJUST_PURSE', { teamId: 'T001', purse: 2 });
      assert.strictEqual(e3.maxAllowedBid('T001'), 0);
    });

    await t('a bid beyond the remaining purse is rejected', async () => {
      const e4 = await freshEngine();
      await e4.dispatch('ADJUST_PURSE', { teamId: 'T001', purse: 2 });
      await e4.dispatch('SELECT_PLAYER', { playerId: 'P009' }); // A, base 2
      await e4.dispatch('START_BIDDING');
      await e4.dispatch('PLACE_BID', { teamId: 'T002', amount: 2 });
      await refuses(e4.dispatch('PLACE_BID', { teamId: 'T001', amount: 3 }), 'INSUFFICIENT_PURSE');
    });
  }

  // ============================================================ max squad
  group('5. Maximum squad size (14)');
  {
    const e = await freshEngine();
    await stockTeam(e, 'T001', 14);
    await t('a team can reach exactly 14 players', () => {
      assert.strictEqual(e.squadSize('T001'), 14);
      assert.strictEqual(e.team('T001').purse, 75 - 14 * 2);
    });
    await t('max allowed bid becomes 0 once the squad is full', () => {
      assert.strictEqual(e.maxAllowedBid('T001'), 0);
    });
    await t('bid eligibility reports "Squad full (14/14)"', () => {
      const el = e.bidEligibility('T001');
      assert.strictEqual(el.canBid, false);
      assert.match(el.reason, /Squad full \(14\/14\)/);
    });
    await t('the server rejects a 15th purchase attempt', async () => {
      const cheap = e.data.players.find((p) => p.status === 'AVAILABLE' && p.basePrice === 2);
      await e.dispatch('SELECT_PLAYER', { playerId: cheap.id });
      await e.dispatch('START_BIDDING');
      await refuses(e.dispatch('PLACE_BID', { teamId: 'T001', amount: 2 }), 'SQUAD_FULL');
      await e.dispatch('MARK_UNSOLD');
    });
  }

  // ============================================================ sold / unsold
  group('6. SOLD and UNSOLD workflows');
  {
    const e = await freshEngine();
    const before = e.team('T002').purse;
    await sellAt(e, 'P001', 'T002', 8);
    const p = e.player('P001');
    const tm = e.team('T002');

    await t('SOLD marks the player, assigns the team and stores the price', () => {
      assert.strictEqual(p.status, 'SOLD');
      assert.strictEqual(p.teamId, 'T002');
      assert.strictEqual(p.soldPrice, 8);
    });
    await t('SOLD deducts the price from the purse and records spend', () => {
      assert.strictEqual(tm.purse, before - 8);
      assert.strictEqual(tm.spent, 8);
    });
    await t('SOLD increments the squad and removes the player from the pool', () => {
      assert.strictEqual(e.squadSize('T002'), 1);
      assert.strictEqual(e.data.players.filter((x) => x.status === 'AVAILABLE').includes(p), false);
    });
    await t('SOLD writes a transaction to the activity log', () => {
      const last = e.data.history.filter((h) => h.action === 'PLAYER_SOLD').pop();
      assert.ok(last);
      assert.strictEqual(last.value, 8);
      assert.match(last.message, /Rahul Sharma SOLD to Titans for 8 Cr/);
    });
    await t('auction state is SOLD and the current player is cleared', () => {
      assert.strictEqual(e.state.status, 'SOLD');
      assert.strictEqual(e.state.currentPlayerId, '');
      assert.strictEqual(e.state.currentBid, null);
    });

    await e.dispatch('SELECT_PLAYER', { playerId: 'P002' });
    await e.dispatch('START_BIDDING');
    await e.dispatch('MARK_UNSOLD');
    await t('UNSOLD moves the player to the unsold pool with no team', () => {
      const u = e.player('P002');
      assert.strictEqual(u.status, 'UNSOLD');
      assert.strictEqual(u.teamId, '');
      assert.strictEqual(u.soldPrice, null);
      assert.strictEqual(u.timesAuctioned, 1);
    });
    await t('an unsold player can be re-auctioned and sold', async () => {
      await e.dispatch('REAUCTION_PLAYER', { playerId: 'P002' });
      assert.strictEqual(e.state.currentPlayerId, 'P002');
      await e.dispatch('START_BIDDING');
      await e.dispatch('PLACE_BID', { teamId: 'T003', amount: 5 });
      await e.dispatch('MARK_SOLD');
      assert.strictEqual(e.player('P002').status, 'SOLD');
      assert.strictEqual(e.player('P002').timesAuctioned, 2);
    });
    await t('an unsold round returns every unsold player to AVAILABLE and bumps the round', async () => {
      await e.dispatch('SELECT_PLAYER', { playerId: 'P003' });
      await e.dispatch('START_BIDDING');
      await e.dispatch('MARK_UNSOLD');
      await e.dispatch('SELECT_PLAYER', { playerId: 'P004' });
      await e.dispatch('START_BIDDING');
      await e.dispatch('MARK_UNSOLD');
      assert.strictEqual(e.stats().unsold, 2);
      const round = e.state.round;
      await e.dispatch('START_UNSOLD_ROUND');
      assert.strictEqual(e.stats().unsold, 0);
      assert.strictEqual(e.state.round, round + 1);
      assert.strictEqual(e.player('P003').status, 'AVAILABLE');
    });
  }

  // ============================================================ random pick
  group('7. Random player selection');
  {
    const e = await freshEngine();
    await sellAt(e, 'P001', 'T001', 5);
    await t('random selection never returns a SOLD player (200 draws)', async () => {
      for (let i = 0; i < 200; i++) {
        await e.dispatch('RANDOM_PLAYER', {});
        const picked = e.player(e.state.currentPlayerId);
        assert.notStrictEqual(picked.id, 'P001');
        assert.strictEqual(picked.status, 'IN_AUCTION');
        await e.dispatch('SKIP_PLAYER');
      }
    });
    await t('random by category only returns players from that category', async () => {
      for (let i = 0; i < 40; i++) {
        await e.dispatch('RANDOM_PLAYER', { category: 'A+' });
        const picked = e.player(e.state.currentPlayerId);
        assert.ok(picked.primaryCategory === 'A+' || picked.secondaryCategory === 'A+', picked.name);
        await e.dispatch('SKIP_PLAYER');
      }
    });
    await t('random by an exhausted category is refused', async () => {
      await refuses(e.dispatch('RANDOM_PLAYER', { category: 'NOPE' }), 'NO_CANDIDATES');
    });
    await t('random selection can be disabled by settings', async () => {
      await e.dispatch('UPDATE_SETTINGS', { patch: { enableRandomPlayer: false } });
      await refuses(e.dispatch('RANDOM_PLAYER', {}), 'DISABLED');
    });
  }

  // ============================================================ captain
  group('8. Captain assignment');
  {
    const e = await freshEngine();
    await sellAt(e, 'P001', 'T001', 5);
    await sellAt(e, 'P002', 'T001', 5);
    await sellAt(e, 'P003', 'T002', 5);

    await t('a captain must belong to that team', async () => {
      await refuses(e.dispatch('ASSIGN_CAPTAIN', { teamId: 'T001', playerId: 'P003' }), 'NOT_IN_SQUAD');
    });
    await t('a captain can be assigned from the squad', async () => {
      await e.dispatch('ASSIGN_CAPTAIN', { teamId: 'T001', playerId: 'P001' });
      assert.strictEqual(e.team('T001').captainId, 'P001');
      assert.strictEqual(e.player('P001').isCaptain, true);
    });
    await t('assigning a new captain clears the old one (one per team)', async () => {
      await e.dispatch('ASSIGN_CAPTAIN', { teamId: 'T001', playerId: 'P002' });
      assert.strictEqual(e.team('T001').captainId, 'P002');
      assert.strictEqual(e.player('P001').isCaptain, false);
      assert.strictEqual(e.player('P002').isCaptain, true);
      assert.strictEqual(e.data.players.filter((p) => p.teamId === 'T001' && p.isCaptain).length, 1);
    });
    await t('captain changes are recorded in history', () => {
      const logs = e.data.history.filter((h) => h.action === 'CAPTAIN_UPDATED');
      assert.strictEqual(logs.length, 2);
    });
    await t('removing the captain from the team clears the captaincy', async () => {
      await e.dispatch('REMOVE_FROM_TEAM', { playerId: 'P002' });
      assert.strictEqual(e.team('T001').captainId, '');
    });
  }

  // ============================================================ corrections
  group('9. Admin correction mode');
  {
    const e = await freshEngine();
    await sellAt(e, 'P001', 'T001', 11);

    await t('reallocating refunds the old team and charges the new one atomically', async () => {
      const w = e.team('T001'); const ti = e.team('T002');
      const wBefore = w.purse; const tBefore = ti.purse;
      await e.dispatch('CORRECT_ALLOCATION', { playerId: 'P001', teamId: 'T002', soldPrice: 10 });
      assert.strictEqual(e.team('T001').purse, wBefore + 11, 'old team refunded 11');
      assert.strictEqual(e.team('T001').spent, 0);
      assert.strictEqual(e.squadSize('T001'), 0);
      assert.strictEqual(e.team('T002').purse, tBefore - 10, 'new team charged 10');
      assert.strictEqual(e.squadSize('T002'), 1);
      assert.strictEqual(e.player('P001').teamId, 'T002');
      assert.strictEqual(e.player('P001').soldPrice, 10);
    });
    await t('both the reallocation and the price change are logged', () => {
      assert.ok(e.data.history.some((h) => h.action === 'ALLOCATION_CORRECTED' && /Warriors -> Titans/.test(h.message)));
      assert.ok(e.data.history.some((h) => h.action === 'PRICE_CHANGED' && /11 Cr -> 10 Cr/.test(h.message)));
    });
    await t('changing only the price on the same team works', async () => {
      const before = e.team('T002').purse;
      await e.dispatch('CORRECT_ALLOCATION', { playerId: 'P001', teamId: 'T002', soldPrice: 4 });
      assert.strictEqual(e.team('T002').purse, before + 6);
      assert.strictEqual(e.player('P001').soldPrice, 4);
    });
    await t('reallocation to a full squad is refused', async () => {
      const e2 = await freshEngine();
      await stockTeam(e2, 'T002', 14);
      await sellAt(e2, 'P001', 'T001', 5);
      await refuses(e2.dispatch('CORRECT_ALLOCATION', { playerId: 'P001', teamId: 'T002' }), 'SQUAD_FULL');
    });
    await t('reallocation the target cannot afford is refused', async () => {
      const e2 = await freshEngine();
      await sellAt(e2, 'P001', 'T001', 5);
      await e2.dispatch('ADJUST_PURSE', { teamId: 'T002', purse: 2 });
      await refuses(e2.dispatch('CORRECT_ALLOCATION', { playerId: 'P001', teamId: 'T002', soldPrice: 5 }), 'INSUFFICIENT_PURSE');
    });
    await t('removing a player from a team refunds and frees them', async () => {
      const e2 = await freshEngine();
      await sellAt(e2, 'P001', 'T001', 7);
      await e2.dispatch('REMOVE_FROM_TEAM', { playerId: 'P001' });
      assert.strictEqual(e2.team('T001').purse, 75);
      assert.strictEqual(e2.team('T001').spent, 0);
      assert.strictEqual(e2.squadSize('T001'), 0);
      assert.strictEqual(e2.player('P001').status, 'AVAILABLE');
      assert.strictEqual(e2.player('P001').teamId, '');
    });
    await t('manual purse adjustment is applied and logged', async () => {
      const e2 = await freshEngine();
      await e2.dispatch('ADJUST_PURSE', { teamId: 'T003', purse: 40 });
      assert.strictEqual(e2.team('T003').purse, 40);
      assert.ok(e2.data.history.some((h) => h.action === 'PURSE_UPDATED' && /75 Cr -> 40 Cr/.test(h.message)));
      await refuses(e2.dispatch('ADJUST_PURSE', { teamId: 'T003', purse: -5 }), 'BAD_AMOUNT');
    });
  }

  // ============================================================ undo
  group('10. Undo');
  {
    const e = await freshEngine();
    await t('undo after SOLD restores purse, squad, player status and price', async () => {
      await sellAt(e, 'P001', 'T001', 9);
      assert.strictEqual(e.team('T001').purse, 66);
      await e.dispatch('UNDO');
      assert.strictEqual(e.team('T001').purse, 75);
      assert.strictEqual(e.team('T001').spent, 0);
      assert.strictEqual(e.squadSize('T001'), 0);
      assert.strictEqual(e.player('P001').soldPrice, null);
      assert.strictEqual(e.player('P001').teamId, '');
    });
    await t('undo after a correction restores both teams', async () => {
      const e2 = await freshEngine();
      await sellAt(e2, 'P001', 'T001', 11);
      await e2.dispatch('CORRECT_ALLOCATION', { playerId: 'P001', teamId: 'T002', soldPrice: 10 });
      await e2.dispatch('UNDO');
      assert.strictEqual(e2.player('P001').teamId, 'T001');
      assert.strictEqual(e2.player('P001').soldPrice, 11);
      assert.strictEqual(e2.team('T001').purse, 64);
      assert.strictEqual(e2.team('T002').purse, 75);
      assert.strictEqual(e2.squadSize('T002'), 0);
    });
    await t('undo after UNSOLD restores the player to IN_AUCTION', async () => {
      const e2 = await freshEngine();
      await e2.dispatch('SELECT_PLAYER', { playerId: 'P005' });
      await e2.dispatch('START_BIDDING');
      await e2.dispatch('MARK_UNSOLD');
      assert.strictEqual(e2.player('P005').status, 'UNSOLD');
      await e2.dispatch('UNDO');
      assert.strictEqual(e2.player('P005').status, 'IN_AUCTION');
      assert.strictEqual(e2.state.status, 'BIDDING');
    });
    await t('undo after a purse adjustment restores the old purse', async () => {
      const e2 = await freshEngine();
      await e2.dispatch('ADJUST_PURSE', { teamId: 'T001', purse: 12 });
      await e2.dispatch('UNDO');
      assert.strictEqual(e2.team('T001').purse, 75);
    });
    await t('undo is recorded in the activity log', async () => {
      assert.ok(e.data.history.some((h) => h.action === 'UNDO'));
    });
    await t('undo on a fresh auction is refused', async () => {
      const e2 = await freshEngine();
      await refuses(e2.dispatch('UNDO'), 'NOTHING_TO_UNDO');
    });
    await t('multiple undos unwind in reverse order', async () => {
      const e2 = await freshEngine();
      await sellAt(e2, 'P001', 'T001', 5);
      await sellAt(e2, 'P002', 'T001', 5);
      assert.strictEqual(e2.squadSize('T001'), 2);
      await e2.dispatch('UNDO');
      assert.strictEqual(e2.squadSize('T001'), 1);
      await e2.dispatch('UNDO');
      assert.strictEqual(e2.squadSize('T001'), 0);
      assert.strictEqual(e2.team('T001').purse, 75);
    });
  }

  // ============================================================ persistence
  group('11. Persistence, backups & CSV export');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auction-test-'));
    tmpDirs.push(dir);
    const e = new AuctionEngine({ dataDir: dir });
    await e.init();
    await e.dispatch('START_AUCTION');
    await sellAt(e, 'P001', 'T001', 12);
    await sellAt(e, 'P009', 'T002', 7);

    await t('auction.json exists and is valid JSON after every action', () => {
      const raw = fs.readFileSync(path.join(dir, 'auction.json'), 'utf8');
      const parsed = JSON.parse(raw);
      assert.strictEqual(parsed.players.length, 64);
      assert.strictEqual(parsed.players.find((p) => p.id === 'P001').soldPrice, 12);
    });
    await t('no stray temp file is left behind', () => {
      assert.strictEqual(fs.existsSync(path.join(dir, 'auction.tmp.json')), false);
    });
    await t('a fresh engine reloads the exact same state from disk', async () => {
      const e2 = new AuctionEngine({ dataDir: dir });
      await e2.init();
      assert.strictEqual(e2.player('P001').soldPrice, 12);
      assert.strictEqual(e2.team('T001').purse, 63);
      assert.strictEqual(e2.squadSize('T002'), 1);
      assert.strictEqual(e2.data.history.length, e.data.history.length);
    });
    await t('backups are written after auction start and each sale', async () => {
      const backups = await e.repo.listBackups();
      assert.ok(backups.length >= 3, `expected >=3 backups, got ${backups.length}`);
      assert.ok(backups.some((b) => /auction-start/.test(b.file)));
      assert.ok(backups.some((b) => /sold-p001/i.test(b.file)));
      for (const b of backups) {
        JSON.parse(fs.readFileSync(path.join(dir, 'backups', b.file), 'utf8'));
      }
    });
    await t('a manual backup can be created on demand', async () => {
      const r = await e.dispatch('CREATE_BACKUP', { label: 'manual' });
      assert.ok(/auction-backup-\d+-manual\.json/.test(r.file), r.file);
    });
    await t('the single-file CSV export parses back with all record types', () => {
      const csv = combinedAuctionCsv(e.data);
      const { header, records } = parseCsv(csv);
      assert.strictEqual(header[0], 'record_type');
      const kinds = {};
      records.forEach((r) => { kinds[r.record_type] = (kinds[r.record_type] || 0) + 1; });
      assert.strictEqual(kinds.PLAYER, 64);
      assert.strictEqual(kinds.TEAM, 6);
      assert.strictEqual(kinds.CATEGORY, 2);
      assert.strictEqual(kinds.STATE, 1);
      assert.ok(kinds.TRANSACTION > 0);
      assert.ok(kinds.SETTING > 0);
      const p1 = records.find((r) => r.record_type === 'PLAYER' && r.id === 'P001');
      assert.strictEqual(p1.sold_price, '12');
      assert.strictEqual(p1.status, 'SOLD');
      assert.strictEqual(JSON.parse(p1.metadata).timesAuctioned, 1);
    });
  }

  // ============================================================ integrity
  group('12. Data integrity across a full simulated auction');
  {
    const e = await freshEngine();
    let sold = 0; let unsold = 0; let guard = 0;

    while (e.data.players.some((p) => p.status === 'AVAILABLE') && guard++ < 400) {
      await e.dispatch('RANDOM_PLAYER', {});
      await e.dispatch('START_BIDDING');
      // Random teams bid the ladder while they legally can.
      let rounds = Math.floor(Math.random() * 5);
      while (rounds-- > 0) {
        const eligible = e.data.teams.filter((tm) => e.bidEligibility(tm.id).canBid);
        if (!eligible.length) break;
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        await e.dispatch('PLACE_BID', { teamId: pick.id, amount: e.nextBidAmount() });
      }
      if (e.state.highestBidderTeamId) { await e.dispatch('MARK_SOLD'); sold++; } else { await e.dispatch('MARK_UNSOLD'); unsold++; }
    }

    await t(`the simulation ran to completion (${sold} sold, ${unsold} unsold)`, () => {
      assert.strictEqual(e.data.players.filter((p) => p.status === 'AVAILABLE').length, 0);
      assert.strictEqual(sold + unsold, 64);
    });
    await t('every team purse stayed at or above zero', () => {
      for (const tm of e.data.teams) assert.ok(tm.purse >= 0, `${tm.name} purse ${tm.purse}`);
    });
    await t('no team exceeded 14 players', () => {
      for (const tm of e.data.teams) assert.ok(e.squadSize(tm.id) <= 14, `${tm.name} squad ${e.squadSize(tm.id)}`);
    });
    await t('every sold player belongs to exactly one team', () => {
      const soldPlayers = e.data.players.filter((p) => p.status === 'SOLD');
      for (const p of soldPlayers) {
        assert.ok(p.teamId, `${p.name} has no team`);
        assert.ok(e.team(p.teamId), `${p.name} points at a missing team`);
        assert.ok(p.soldPrice > 0, `${p.name} has no price`);
      }
      const assigned = soldPlayers.map((p) => p.id);
      assert.strictEqual(new Set(assigned).size, assigned.length);
    });
    await t('unsold and available players belong to no team', () => {
      for (const p of e.data.players) {
        if (p.status !== 'SOLD') {
          assert.strictEqual(p.teamId, '', `${p.name} (${p.status}) still has a team`);
          assert.strictEqual(p.soldPrice, null, `${p.name} (${p.status}) still has a price`);
        }
      }
    });
    await t('purse arithmetic reconciles: starting = spent + remaining', () => {
      for (const tm of e.data.teams) {
        const squadTotal = e.squadOf(tm.id).reduce((s, p) => s + p.soldPrice, 0);
        assert.strictEqual(tm.spent, squadTotal, `${tm.name} spent ${tm.spent} vs squad total ${squadTotal}`);
        assert.strictEqual(tm.startingPurse - tm.spent, tm.purse, `${tm.name} purse mismatch`);
      }
    });
    await t('total spend across teams equals total sold value', () => {
      const teamSpend = e.data.teams.reduce((s, tm) => s + tm.spent, 0);
      assert.strictEqual(teamSpend, e.stats().totalSpent);
    });
    await t('the saved JSON on disk matches the in-memory state', () => {
      const disk = JSON.parse(fs.readFileSync(path.join(e.dataDir, 'auction.json'), 'utf8'));
      assert.strictEqual(disk.players.filter((p) => p.status === 'SOLD').length, e.stats().sold);
      assert.deepStrictEqual(disk.teams.map((tm) => tm.purse), e.data.teams.map((tm) => tm.purse));
    });
  }

  // ============================================================ concurrency
  group('13. Bid locking (engine level)');
  {
    const e = await freshEngine();
    await e.dispatch('SELECT_PLAYER', { playerId: 'P001' });
    await e.dispatch('START_BIDDING');

    await t('6 teams firing the same 5 Cr bid at once -> exactly 1 accepted', async () => {
      const results = await Promise.allSettled(
        ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'].map((id) => e.dispatch('PLACE_BID', { teamId: id, amount: 5 })),
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      assert.strictEqual(ok.length, 1, `expected 1 accepted, got ${ok.length}`);
      assert.strictEqual(rejected.length, 5);
      assert.strictEqual(e.state.currentBid, 5);
      rejected.forEach((r) => assert.strictEqual(r.reason.code, 'STALE_BID'));
    });
    await t('the bid ladder recorded exactly one entry for that amount', () => {
      assert.strictEqual(e.state.bidHistory.filter((b) => b.amount === 5).length, 1);
    });
    await t('a burst of 30 mixed bids never double-books an amount', async () => {
      const teams = ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'];
      for (let round = 0; round < 5; round++) {
        const target = e.nextBidAmount();
        await Promise.allSettled(teams.map((id) => e.dispatch('PLACE_BID', { teamId: id, amount: target })));
        assert.strictEqual(e.state.bidHistory.filter((b) => b.amount === target).length, 1, `amount ${target}`);
      }
      const amounts = e.state.bidHistory.map((b) => b.amount);
      assert.strictEqual(new Set(amounts).size, amounts.length, 'duplicate bid amounts found');
    });
  }

  // ============================================================ summary
  console.log(`\n\x1b[1m─── SUMMARY ───\x1b[0m`);
  console.log(`  \x1b[32mpassed: ${pass}\x1b[0m`);
  console.log(`  ${fail ? '\x1b[31m' : ''}failed: ${fail}\x1b[0m`);
  if (fail) {
    console.log('\nFailures:');
    failures.forEach((f) => {
      console.log(`\n  [${f.group}] ${f.name}`);
      console.log(`  ${f.err.stack.split('\n').slice(0, 4).join('\n  ')}`);
    });
  }
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\nTest harness crashed:', err);
  process.exit(1);
});
