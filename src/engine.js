'use strict';

const path = require('path');
const { Repository } = require('./repository');
const { buildSeed } = require('./seed');

const AUCTION_STATES = ['WAITING', 'PLAYER_SELECTED', 'BIDDING', 'PAUSED', 'SOLD', 'UNSOLD', 'COMPLETED'];
const PLAYER_STATES = ['AVAILABLE', 'IN_AUCTION', 'SOLD', 'UNSOLD', 'REMOVED'];

class AuctionError extends Error {
  constructor(message, code = 'INVALID_ACTION') {
    super(message);
    this.name = 'AuctionError';
    this.code = code;
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();

class AuctionEngine {
  constructor({ dataDir, onChange } = {}) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.repo = new Repository(this.dataDir);
    this.onChange = onChange || (() => {});
    this.data = null;
    this.undoStack = [];
    this.maxUndo = 50;
    this._chain = Promise.resolve();
  }

  // ---------------------------------------------------------------- lifecycle

  async init() {
    const loaded = await this.repo.load();
    this.data = loaded ? this._normalise(loaded) : buildSeed();
    if (!loaded) await this.repo.save(this.data);
    return this;
  }

  /** Fill in anything a hand-edited / older file might be missing. */
  _normalise(d) {
    const seed = buildSeed();
    const data = {
      version: d.version || 1,
      settings: { ...seed.settings, ...(d.settings || {}) },
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories : seed.categories,
      players: Array.isArray(d.players) ? d.players : seed.players,
      teams: Array.isArray(d.teams) ? d.teams : seed.teams,
      state: { ...seed.state, ...(d.state || {}) },
      history: Array.isArray(d.history) ? d.history : [],
      counters: { transaction: 0, ...(d.counters || {}) },
    };
    data.players = data.players.map((p) => ({
      id: p.id, name: p.name, photo: p.photo || '',
      primaryCategory: p.primaryCategory || '', secondaryCategory: p.secondaryCategory || '',
      role: p.role || '', basePrice: Number(p.basePrice) || 0,
      status: PLAYER_STATES.includes(p.status) ? p.status : 'AVAILABLE',
      soldPrice: p.soldPrice === null || p.soldPrice === undefined || p.soldPrice === '' ? null : Number(p.soldPrice),
      teamId: p.teamId || '', isCaptain: !!p.isCaptain,
      sequence: Number(p.sequence) || 0, notes: p.notes || '',
      timesAuctioned: Number(p.timesAuctioned) || 0,
    }));
    data.teams = data.teams.map((t) => ({
      id: t.id, name: t.name, owner: t.owner || '', color: t.color || '#888', logo: t.logo || '',
      startingPurse: Number(t.startingPurse) || data.settings.startingPurse,
      purse: Number(t.purse) || 0, spent: Number(t.spent) || 0,
      minSquad: Number(t.minSquad) || data.settings.minSquad,
      maxSquad: Number(t.maxSquad) || data.settings.maxSquad,
      captainId: t.captainId || '', status: t.status || 'ACTIVE',
    }));
    if (!AUCTION_STATES.includes(data.state.status)) data.state.status = 'WAITING';
    if (!Array.isArray(data.state.bidHistory)) data.state.bidHistory = [];
    return data;
  }

  // ---------------------------------------------------------------- accessors

  get settings() { return this.data.settings; }
  get state() { return this.data.state; }

  player(id) { return this.data.players.find((p) => p.id === id) || null; }
  team(id) { return this.data.teams.find((t) => t.id === id) || null; }

  requirePlayer(id) {
    const p = this.player(id);
    if (!p) throw new AuctionError(`Player ${id} not found`, 'NOT_FOUND');
    return p;
  }

  requireTeam(id) {
    const t = this.team(id);
    if (!t) throw new AuctionError(`Team ${id} not found`, 'NOT_FOUND');
    return t;
  }

  squadOf(teamId) {
    return this.data.players.filter((p) => p.teamId === teamId && p.status === 'SOLD');
  }

  squadSize(teamId) { return this.squadOf(teamId).length; }

  currentPlayer() {
    return this.state.currentPlayerId ? this.player(this.state.currentPlayerId) : null;
  }

  categoryPrice(name) {
    const c = this.data.categories.find((x) => x.name === name);
    return c ? Number(c.basePrice) : 0;
  }

  /** Cheapest player money can buy - drives the minimum-squad reserve. */
  minPlayerPrice() {
    const prices = this.data.categories.map((c) => Number(c.basePrice)).filter((n) => n > 0);
    return prices.length ? Math.min(...prices) : 1;
  }

  /**
   * Spec section 8 / 10 - maximum a team may legally bid so it can still
   * finish a minimum squad.
   *
   *   reserveMode 'corrected' (default): reserve for players needed AFTER this one.
   *   reserveMode 'spec': the literal document formula (minSquad - currentSquadSize),
   *                       which reserves one player too many and strands a team
   *                       sitting on 10 players with exactly 1 Cr left.
   */
  maxAllowedBid(teamId) {
    const team = this.requireTeam(teamId);
    const size = this.squadSize(teamId);
    if (size >= team.maxSquad) return 0;
    const afterThis = this.settings.reserveMode === 'spec' ? size : size + 1;
    const playersNeeded = Math.max(0, team.minSquad - afterThis);
    const reserve = playersNeeded * this.minPlayerPrice();
    return Math.max(0, team.purse - reserve);
  }

  nextBidAmount() {
    const p = this.currentPlayer();
    if (!p) return null;
    if (this.state.currentBid === null) return p.basePrice;
    return this.state.currentBid + Number(this.settings.bidIncrement);
  }

  /** Everything the UI needs to enable/disable a team's bid button. */
  bidEligibility(teamId) {
    const team = this.team(teamId);
    if (!team) return { canBid: false, reason: 'Team not found', maxAllowedBid: 0, nextBid: null };
    const size = this.squadSize(teamId);
    const maxBid = this.maxAllowedBid(teamId);
    const nextBid = this.nextBidAmount();
    const out = { maxAllowedBid: maxBid, nextBid, squadSize: size, canBid: false, reason: '' };

    if (team.status !== 'ACTIVE') { out.reason = 'Team is not active'; return out; }
    if (size >= team.maxSquad) { out.reason = `Squad full (${size}/${team.maxSquad})`; return out; }
    if (this.state.status === 'PAUSED') { out.reason = 'Auction is paused'; return out; }
    if (this.state.status !== 'BIDDING') { out.reason = 'Bidding is not open'; return out; }
    if (!this.currentPlayer()) { out.reason = 'No player in auction'; return out; }
    if (this.state.highestBidderTeamId === teamId) { out.reason = 'You are the highest bidder'; return out; }
    if (nextBid > team.purse) { out.reason = `Purse left is only ${team.purse} Cr`; return out; }
    if (nextBid > maxBid) {
      out.reason = `Max allowed bid is ${maxBid} Cr (reserving for ${team.minSquad}-player squad)`;
      return out;
    }
    out.canBid = true;
    return out;
  }

  // ---------------------------------------------------------------- history

  _log(action, message, extra = {}) {
    this.data.counters.transaction += 1;
    const entry = {
      id: 'TX' + String(this.data.counters.transaction).padStart(4, '0'),
      ts: nowIso(),
      action,
      message,
      playerId: extra.playerId || '',
      teamId: extra.teamId || '',
      value: extra.value === undefined ? null : extra.value,
      meta: extra.meta || null,
    };
    this.data.history.push(entry);
    return entry;
  }

  // ---------------------------------------------------------------- undo

  _pushUndo(label) {
    this.undoStack.push({
      label,
      ts: nowIso(),
      snapshot: clone({
        settings: this.data.settings,
        categories: this.data.categories,
        players: this.data.players,
        teams: this.data.teams,
        state: this.data.state,
      }),
    });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  // ---------------------------------------------------------------- dispatch

  /**
   * Every mutation funnels through here. The promise chain guarantees actions are
   * applied one at a time, start to finish (validate -> mutate -> persist), so two
   * simultaneous bids can never both win - spec section 13.
   */
  dispatch(type, payload = {}) {
    const run = this._chain.then(() => this._run(type, payload));
    this._chain = run.catch(() => {});
    return run;
  }

  async _run(type, payload) {
    const handler = HANDLERS[type];
    if (!handler) throw new AuctionError(`Unknown action: ${type}`, 'UNKNOWN_ACTION');

    // Mutation is fully synchronous - nothing can interleave inside it.
    const result = handler.call(this, payload || {}) || {};
    const events = result.events || [];

    let backupFile = null;
    if (result.backup && (this.settings.autoBackup || result.forceBackup)) {
      backupFile = await this.repo.backup(this.data, result.backup);
      if (result.forceBackup) {
        this._log('BACKUP_CREATED', `Backup created: ${backupFile}`, { meta: { file: backupFile } });
      }
    }
    await this.repo.save(this.data);

    const snap = this.snapshot();
    this.onChange(snap, events);
    return {
      ok: true,
      message: backupFile && result.forceBackup ? `Backup created: ${backupFile}` : (result.message || ''),
      events,
      snapshot: snap,
      file: backupFile,
    };
  }

  // ---------------------------------------------------------------- snapshot

  snapshot() {
    const d = this.data;
    const cp = this.currentPlayer();
    const teams = d.teams.map((t) => {
      const squad = this.squadOf(t.id).sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0));
      const elig = this.bidEligibility(t.id);
      return {
        ...t,
        squadSize: squad.length,
        squad: squad.map((p) => ({
          id: p.id, name: p.name, primaryCategory: p.primaryCategory,
          secondaryCategory: p.secondaryCategory, role: p.role,
          basePrice: p.basePrice, soldPrice: p.soldPrice, isCaptain: p.isCaptain,
        })),
        captainName: (this.player(t.captainId) || {}).name || '',
        maxAllowedBid: elig.maxAllowedBid,
        canBid: elig.canBid,
        bidBlockedReason: elig.reason,
        slotsLeft: t.maxSquad - squad.length,
        needForMin: Math.max(0, t.minSquad - squad.length),
      };
    });

    return {
      serverTime: nowIso(),
      settings: d.settings,
      categories: d.categories,
      auctionStates: AUCTION_STATES,
      state: {
        status: d.state.status,
        started: d.state.started,
        round: d.state.round,
        currentBid: d.state.currentBid,
        nextBid: this.nextBidAmount(),
        highestBidderTeamId: d.state.highestBidderTeamId,
        highestBidderName: (this.team(d.state.highestBidderTeamId) || {}).name || '',
        currentPlayerId: d.state.currentPlayerId,
        pausedFrom: d.state.pausedFrom,
        startedAt: d.state.startedAt,
        completedAt: d.state.completedAt,
        bidHistory: d.state.bidHistory.slice(-25),
      },
      currentPlayer: cp
        ? { ...cp, teamName: (this.team(cp.teamId) || {}).name || '' }
        : null,
      players: d.players.map((p) => ({ ...p, teamName: (this.team(p.teamId) || {}).name || '' })),
      teams,
      stats: this.stats(),
      history: d.history.slice(-300).reverse(),
      undo: {
        canUndo: this.undoStack.length > 0,
        label: this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : '',
        depth: this.undoStack.length,
      },
    };
  }

  stats() {
    const d = this.data;
    const sold = d.players.filter((p) => p.status === 'SOLD');
    const unsold = d.players.filter((p) => p.status === 'UNSOLD');
    const available = d.players.filter((p) => p.status === 'AVAILABLE');
    const removed = d.players.filter((p) => p.status === 'REMOVED');
    const totalSpent = sold.reduce((s, p) => s + (p.soldPrice || 0), 0);
    const byPrice = [...sold].sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0));
    const top = byPrice[0] || null;

    const highestByCategory = {};
    for (const c of d.categories) {
      const best = byPrice.find((p) => p.primaryCategory === c.name);
      highestByCategory[c.name] = best
        ? { player: best.name, price: best.soldPrice, team: (this.team(best.teamId) || {}).name || '' }
        : null;
    }

    const teamSpend = d.teams.map((t) => ({
      id: t.id, name: t.name, spent: t.spent, purse: t.purse, squadSize: this.squadSize(t.id),
    }));
    const bySpent = [...teamSpend].sort((a, b) => b.spent - a.spent);
    const byPurse = [...teamSpend].sort((a, b) => b.purse - a.purse);

    return {
      totalPlayers: d.players.length,
      sold: sold.length,
      unsold: unsold.length,
      available: available.length,
      removed: removed.length,
      auctioned: sold.length + unsold.length,
      totalSpent,
      averageSoldPrice: sold.length ? Math.round((totalSpent / sold.length) * 100) / 100 : 0,
      highestPurchase: top
        ? { player: top.name, price: top.soldPrice, team: (this.team(top.teamId) || {}).name || '' }
        : null,
      highestByCategory,
      mostExpensiveTeam: bySpent[0] || null,
      largestPurseTeam: byPurse[0] || null,
      smallestPurseTeam: byPurse[byPurse.length - 1] || null,
      playersPerTeam: teamSpend,
      totalPurseRemaining: d.teams.reduce((s, t) => s + t.purse, 0),
    };
  }

  // ------------------------------------------------------------ mutation core

  /** Atomic SOLD transfer, shared by markSold and admin correction. */
  _assign(player, team, price) {
    player.status = 'SOLD';
    player.teamId = team.id;
    player.soldPrice = price;
    team.purse = Math.round((team.purse - price) * 100) / 100;
    team.spent = Math.round((team.spent + price) * 100) / 100;
  }

  /** Reverse of _assign - refunds the team and detaches the player. */
  _unassign(player, nextStatus = 'AVAILABLE') {
    const team = this.team(player.teamId);
    if (team) {
      const price = player.soldPrice || 0;
      team.purse = Math.round((team.purse + price) * 100) / 100;
      team.spent = Math.round((team.spent - price) * 100) / 100;
      if (team.captainId === player.id) team.captainId = '';
    }
    player.isCaptain = false;
    player.teamId = '';
    player.soldPrice = null;
    player.status = nextStatus;
    return team;
  }

  _clearCurrent() {
    this.state.currentPlayerId = '';
    this.state.currentBid = null;
    this.state.highestBidderTeamId = '';
    this.state.bidHistory = [];
  }

  _assertStarted() {
    if (!this.state.started) throw new AuctionError('Auction has not been started yet', 'NOT_STARTED');
    if (this.state.status === 'COMPLETED') throw new AuctionError('Auction is already completed', 'COMPLETED');
    if (this.state.status === 'PAUSED') throw new AuctionError('Auction is paused - resume it first', 'PAUSED');
  }
}

// ==================================================================
// Action handlers. `this` is the engine; each returns { message, events, backup }
// and mutates synchronously.
// ==================================================================

const HANDLERS = {

  // ------------------------------------------------------- auction lifecycle

  START_AUCTION() {
    if (this.state.started && this.state.status !== 'COMPLETED') {
      throw new AuctionError('Auction is already running', 'ALREADY_STARTED');
    }
    if (this.data.teams.filter((t) => t.status === 'ACTIVE').length < 2) {
      throw new AuctionError('At least 2 active teams are required', 'NOT_ENOUGH_TEAMS');
    }
    if (!this.data.players.some((p) => p.status === 'AVAILABLE')) {
      throw new AuctionError('No available players to auction', 'NO_PLAYERS');
    }
    this.state.started = true;
    this.state.status = 'WAITING';
    this.state.completedAt = '';
    this.state.startedAt = nowIso();
    this._clearCurrent();
    this._log('AUCTION_STARTED', 'Auction started');
    return { message: 'Auction started', events: [{ type: 'AUCTION_STARTED' }], backup: 'auction-start' };
  },

  PAUSE_AUCTION() {
    if (!this.state.started) throw new AuctionError('Auction has not been started', 'NOT_STARTED');
    if (this.state.status === 'PAUSED') throw new AuctionError('Auction is already paused', 'ALREADY_PAUSED');
    if (this.state.status === 'COMPLETED') throw new AuctionError('Auction is completed', 'COMPLETED');
    this.state.pausedFrom = this.state.status;
    this.state.status = 'PAUSED';
    this._log('AUCTION_PAUSED', 'Auction paused');
    return { message: 'Auction paused', events: [{ type: 'AUCTION_PAUSED' }] };
  },

  RESUME_AUCTION() {
    if (this.state.status !== 'PAUSED') throw new AuctionError('Auction is not paused', 'NOT_PAUSED');
    this.state.status = this.state.pausedFrom || 'WAITING';
    this.state.pausedFrom = '';
    this._log('AUCTION_RESUMED', `Auction resumed (${this.state.status})`);
    return { message: 'Auction resumed', events: [{ type: 'AUCTION_RESUMED' }] };
  },

  END_AUCTION() {
    if (!this.state.started) throw new AuctionError('Auction has not been started', 'NOT_STARTED');
    const cp = this.currentPlayer();
    if (cp && cp.status === 'IN_AUCTION') cp.status = 'AVAILABLE';
    this._clearCurrent();
    this.state.status = 'COMPLETED';
    this.state.completedAt = nowIso();
    this._log('AUCTION_COMPLETED', 'Auction completed');
    return { message: 'Auction completed', events: [{ type: 'AUCTION_COMPLETED' }], backup: 'auction-end' };
  },

  // ------------------------------------------------------- player selection

  SELECT_PLAYER({ playerId }) {
    this._assertStarted();
    if (this.state.status === 'PLAYER_SELECTED' || this.state.status === 'BIDDING') {
      throw new AuctionError(
        `${(this.currentPlayer() || {}).name || 'A player'} is already in the auction - mark them SOLD/UNSOLD first`,
        'PLAYER_IN_AUCTION');
    }
    const p = this.requirePlayer(playerId);
    if (p.status === 'SOLD') throw new AuctionError(`${p.name} is already sold`, 'ALREADY_SOLD');
    if (p.status === 'REMOVED') throw new AuctionError(`${p.name} has been removed from the pool`, 'REMOVED');
    if (p.status === 'IN_AUCTION') throw new AuctionError(`${p.name} is already in the auction`, 'PLAYER_IN_AUCTION');

    p.status = 'IN_AUCTION';
    this.state.currentPlayerId = p.id;
    this.state.currentBid = null;
    this.state.highestBidderTeamId = '';
    this.state.bidHistory = [];
    this.state.status = 'PLAYER_SELECTED';
    this._log('PLAYER_SELECTED', `Player selected: ${p.name} (${p.primaryCategory}, base ${p.basePrice} Cr)`,
      { playerId: p.id, value: p.basePrice });
    return {
      message: `${p.name} selected - starting bid ${p.basePrice} Cr`,
      events: [{ type: 'PLAYER_SELECTED', playerId: p.id, playerName: p.name }],
    };
  },

  RANDOM_PLAYER({ category, pool }) {
    if (!this.settings.enableRandomPlayer) {
      throw new AuctionError('Random player selection is disabled in settings', 'DISABLED');
    }
    if (category && !this.settings.enableRandomCategory) {
      throw new AuctionError('Random selection by category is disabled in settings', 'DISABLED');
    }
    const wanted = pool === 'unsold' ? ['UNSOLD'] : pool === 'both' ? ['AVAILABLE', 'UNSOLD'] : ['AVAILABLE'];
    let candidates = this.data.players.filter((p) => wanted.includes(p.status));
    if (category) {
      candidates = candidates.filter((p) => p.primaryCategory === category || p.secondaryCategory === category);
    }
    if (!candidates.length) {
      throw new AuctionError(
        category ? `No ${wanted.join('/')} players left in category ${category}` : `No ${wanted.join('/')} players left`,
        'NO_CANDIDATES');
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const res = HANDLERS.SELECT_PLAYER.call(this, { playerId: pick.id });
    return { ...res, message: `Randomly picked ${pick.name}` + (category ? ` from ${category}` : '') };
  },

  START_BIDDING() {
    this._assertStarted();
    if (this.state.status !== 'PLAYER_SELECTED') {
      throw new AuctionError('Select a player before starting bidding', 'NO_PLAYER_SELECTED');
    }
    const p = this.requirePlayer(this.state.currentPlayerId);
    p.timesAuctioned += 1;
    this.state.status = 'BIDDING';
    this._log('BIDDING_STARTED', `Bidding open for ${p.name} at base price ${p.basePrice} Cr`,
      { playerId: p.id, value: p.basePrice });
    return {
      message: `Bidding open - first valid bid is ${p.basePrice} Cr`,
      events: [{ type: 'AUCTION_STARTED', playerId: p.id, playerName: p.name }],
    };
  },

  SKIP_PLAYER() {
    if (!this.state.currentPlayerId) throw new AuctionError('No player is in the auction', 'NO_PLAYER');
    const p = this.requirePlayer(this.state.currentPlayerId);
    p.status = 'AVAILABLE';
    this._clearCurrent();
    this.state.status = 'WAITING';
    this._log('PLAYER_SKIPPED', `${p.name} returned to the pool without a result`, { playerId: p.id });
    return { message: `${p.name} skipped`, events: [{ type: 'PLAYER_CHANGED', playerId: p.id }] };
  },

  NEXT_PLAYER() {
    if (!['SOLD', 'UNSOLD', 'WAITING'].includes(this.state.status)) {
      if (this.state.currentPlayerId) return HANDLERS.SKIP_PLAYER.call(this);
    }
    this._clearCurrent();
    this.state.status = 'WAITING';
    return { message: 'Ready for the next player', events: [{ type: 'PLAYER_CHANGED' }] };
  },

  // ------------------------------------------------------------------- bids

  PLACE_BID({ teamId, amount }) {
    // Order matters: the "someone already bid that" check comes before purse
    // checks so a losing race gets the spec's exact rejection message.
    if (this.state.status === 'PAUSED') throw new AuctionError('Auction is paused - bids are not accepted', 'PAUSED');
    if (this.state.status !== 'BIDDING') throw new AuctionError('Bidding is not open', 'NOT_BIDDING');

    const player = this.currentPlayer();
    if (!player) throw new AuctionError('No player is currently in the auction', 'NO_PLAYER');
    if (player.status !== 'IN_AUCTION') throw new AuctionError(`${player.name} is no longer in the auction`, 'NOT_IN_AUCTION');

    const team = this.requireTeam(teamId);
    if (team.status !== 'ACTIVE') throw new AuctionError(`${team.name} is not active`, 'TEAM_INACTIVE');

    const size = this.squadSize(team.id);
    if (size >= team.maxSquad) {
      throw new AuctionError(`Squad full - ${team.name} already has ${size}/${team.maxSquad} players`, 'SQUAD_FULL');
    }

    const expected = this.nextBidAmount();
    const bid = Number(amount);
    if (!Number.isFinite(bid)) throw new AuctionError('Bid amount is not a number', 'BAD_AMOUNT');

    if (bid !== expected) {
      if (this.state.currentBid !== null && bid <= this.state.currentBid) {
        throw new AuctionError(
          `Bid rejected. Current bid is already ${this.state.currentBid} Cr. Next valid bid is ${expected} Cr.`,
          'STALE_BID');
      }
      throw new AuctionError(
        `Bid rejected. Bids move in ${this.settings.bidIncrement} Cr steps - the only valid bid right now is ${expected} Cr.`,
        'BAD_INCREMENT');
    }

    if (this.state.highestBidderTeamId === team.id) {
      throw new AuctionError(`${team.name} is already the highest bidder`, 'ALREADY_HIGHEST');
    }
    if (bid > team.purse) {
      throw new AuctionError(`${team.name} has only ${team.purse} Cr left`, 'INSUFFICIENT_PURSE');
    }
    const maxBid = this.maxAllowedBid(team.id);
    if (bid > maxBid) {
      throw new AuctionError(
        `Bid rejected. ${team.name} can bid at most ${maxBid} Cr - ${Math.max(0, team.minSquad - (size + 1))} more players are needed to reach the ${team.minSquad}-player minimum.`,
        'MIN_SQUAD_PROTECTION');
    }

    this.state.currentBid = bid;
    this.state.highestBidderTeamId = team.id;
    this.state.bidHistory.push({ teamId: team.id, teamName: team.name, amount: bid, ts: nowIso() });
    this._log('BID_PLACED', `${team.name} bid ${bid} Cr for ${player.name}`,
      { playerId: player.id, teamId: team.id, value: bid });

    return {
      message: `${team.name} bid ${bid} Cr`,
      events: [{ type: 'BID_PLACED', teamId: team.id, teamName: team.name, amount: bid, playerId: player.id }],
    };
  },

  // --------------------------------------------------------- sold / unsold

  MARK_SOLD() {
    this._assertStarted();
    if (this.state.status !== 'BIDDING') {
      throw new AuctionError('Player is not in bidding - nothing to sell', 'NOT_BIDDING');
    }
    const player = this.currentPlayer();
    if (!player) throw new AuctionError('No player is currently in the auction', 'NO_PLAYER');
    if (!this.state.highestBidderTeamId || this.state.currentBid === null) {
      throw new AuctionError('No bids yet - mark UNSOLD instead', 'NO_BIDDER');
    }
    const team = this.requireTeam(this.state.highestBidderTeamId);
    const price = this.state.currentBid;

    const size = this.squadSize(team.id);
    if (size >= team.maxSquad) throw new AuctionError(`${team.name} squad is full`, 'SQUAD_FULL');
    if (price > team.purse) throw new AuctionError(`${team.name} cannot afford ${price} Cr`, 'INSUFFICIENT_PURSE');
    const maxBid = this.maxAllowedBid(team.id);
    if (price > maxBid) throw new AuctionError(`${price} Cr exceeds ${team.name}'s max allowed bid of ${maxBid} Cr`, 'MIN_SQUAD_PROTECTION');

    this._pushUndo(`SOLD: ${player.name} to ${team.name} for ${price} Cr`);
    this._assign(player, team, price);
    this._clearCurrent();
    this.state.status = 'SOLD';

    this._log('PLAYER_SOLD', `${player.name} SOLD to ${team.name} for ${price} Cr`,
      { playerId: player.id, teamId: team.id, value: price, meta: { squadSize: this.squadSize(team.id), purseLeft: team.purse } });

    return {
      message: `${player.name} sold to ${team.name} for ${price} Cr`,
      backup: `sold-${player.id}`,
      events: [{
        type: 'PLAYER_SOLD', playerId: player.id, playerName: player.name,
        teamId: team.id, teamName: team.name, amount: price,
      }, { type: 'TEAM_UPDATED', teamId: team.id }],
    };
  },

  MARK_UNSOLD() {
    this._assertStarted();
    if (!['PLAYER_SELECTED', 'BIDDING'].includes(this.state.status)) {
      throw new AuctionError('No player is currently in the auction', 'NO_PLAYER');
    }
    const player = this.currentPlayer();
    if (!player) throw new AuctionError('No player is currently in the auction', 'NO_PLAYER');

    this._pushUndo(`UNSOLD: ${player.name}`);
    if (this.state.status === 'PLAYER_SELECTED') player.timesAuctioned += 1;
    player.status = 'UNSOLD';
    player.teamId = '';
    player.soldPrice = null;
    this._clearCurrent();
    this.state.status = 'UNSOLD';

    this._log('PLAYER_UNSOLD', `${player.name} went UNSOLD`, { playerId: player.id, meta: { timesAuctioned: player.timesAuctioned } });
    return {
      message: `${player.name} marked unsold`,
      events: [{ type: 'PLAYER_UNSOLD', playerId: player.id, playerName: player.name }],
    };
  },

  START_UNSOLD_ROUND() {
    if (!this.settings.allowUnsoldRound) throw new AuctionError('Unsold rounds are disabled in settings', 'DISABLED');
    if (this.state.status === 'BIDDING' || this.state.status === 'PLAYER_SELECTED') {
      throw new AuctionError('Finish the current player first', 'PLAYER_IN_AUCTION');
    }
    const unsold = this.data.players.filter((p) => p.status === 'UNSOLD');
    if (!unsold.length) throw new AuctionError('There are no unsold players', 'NO_CANDIDATES');

    this._pushUndo(`Unsold round: returned ${unsold.length} players to the pool`);
    unsold.forEach((p) => { p.status = 'AVAILABLE'; });
    this.state.round += 1;
    this.state.status = 'WAITING';
    this.state.started = true;
    this._clearCurrent();
    this._log('UNSOLD_ROUND_STARTED', `Unsold round ${this.state.round} started with ${unsold.length} players`,
      { value: unsold.length });
    return {
      message: `Round ${this.state.round}: ${unsold.length} unsold players returned to the pool`,
      backup: `unsold-round-${this.state.round}`,
      events: [{ type: 'PLAYER_CHANGED' }],
    };
  },

  REAUCTION_PLAYER({ playerId }) {
    const p = this.requirePlayer(playerId);
    if (p.status !== 'UNSOLD') throw new AuctionError(`${p.name} is not in the unsold pool`, 'NOT_UNSOLD');
    p.status = 'AVAILABLE';
    const res = HANDLERS.SELECT_PLAYER.call(this, { playerId });
    return { ...res, message: `${p.name} back in the auction` };
  },

  RETURN_TO_POOL({ playerId }) {
    const p = this.requirePlayer(playerId);
    if (!['UNSOLD', 'REMOVED'].includes(p.status)) {
      throw new AuctionError(`${p.name} is ${p.status} - use "Remove from team" instead`, 'BAD_STATUS');
    }
    this._pushUndo(`Returned ${p.name} to the available pool`);
    p.status = 'AVAILABLE';
    this._log('PLAYER_RETURNED', `${p.name} returned to the available pool`, { playerId: p.id });
    return { message: `${p.name} is available again`, events: [{ type: 'PLAYER_CHANGED', playerId: p.id }] };
  },

  // -------------------------------------------------------- admin correction

  CORRECT_ALLOCATION({ playerId, teamId, soldPrice }) {
    const player = this.requirePlayer(playerId);
    if (player.status !== 'SOLD') throw new AuctionError(`${player.name} is not sold`, 'NOT_SOLD');

    const fromTeam = this.requireTeam(player.teamId);
    const toTeam = this.requireTeam(teamId);
    if (toTeam.status !== 'ACTIVE') throw new AuctionError(`${toTeam.name} is not active`, 'TEAM_INACTIVE');

    const oldPrice = player.soldPrice;
    const newPrice = soldPrice === undefined || soldPrice === null || soldPrice === '' ? oldPrice : Number(soldPrice);
    if (!Number.isFinite(newPrice) || newPrice < 0) throw new AuctionError('Invalid sold price', 'BAD_AMOUNT');

    if (toTeam.id !== fromTeam.id) {
      const size = this.squadSize(toTeam.id);
      if (size >= toTeam.maxSquad) {
        throw new AuctionError(`${toTeam.name} squad is full (${size}/${toTeam.maxSquad})`, 'SQUAD_FULL');
      }
    }
    // Purse check against the target team's purse *after* any refund it may receive.
    const refundToTarget = fromTeam.id === toTeam.id ? oldPrice : 0;
    if (newPrice > toTeam.purse + refundToTarget) {
      throw new AuctionError(
        `${toTeam.name} has only ${toTeam.purse + refundToTarget} Cr available`, 'INSUFFICIENT_PURSE');
    }

    this._pushUndo(`Correction: ${player.name} ${fromTeam.name} ${oldPrice} Cr -> ${toTeam.name} ${newPrice} Cr`);
    const wasCaptain = fromTeam.captainId === player.id;
    this._unassign(player, 'AVAILABLE');
    this._assign(player, toTeam, newPrice);
    if (wasCaptain && toTeam.id === fromTeam.id) {
      toTeam.captainId = player.id;
      player.isCaptain = true;
    }

    if (fromTeam.id !== toTeam.id) {
      this._log('ALLOCATION_CORRECTED',
        `Admin changed ${player.name} allocation: ${fromTeam.name} -> ${toTeam.name}`,
        { playerId: player.id, teamId: toTeam.id, value: newPrice, meta: { fromTeam: fromTeam.name, toTeam: toTeam.name } });
    }
    if (oldPrice !== newPrice) {
      this._log('PRICE_CHANGED', `Price changed for ${player.name}: ${oldPrice} Cr -> ${newPrice} Cr`,
        { playerId: player.id, teamId: toTeam.id, value: newPrice, meta: { oldPrice, newPrice } });
    }

    return {
      message: `${player.name} now with ${toTeam.name} at ${newPrice} Cr`,
      backup: `correction-${player.id}`,
      events: [{ type: 'STATE_CORRECTED', playerId: player.id },
        { type: 'TEAM_UPDATED', teamId: fromTeam.id }, { type: 'TEAM_UPDATED', teamId: toTeam.id }],
    };
  },

  REMOVE_FROM_TEAM({ playerId }) {
    const player = this.requirePlayer(playerId);
    if (player.status !== 'SOLD') throw new AuctionError(`${player.name} is not assigned to a team`, 'NOT_SOLD');
    const team = this.requireTeam(player.teamId);
    const price = player.soldPrice;
    this._pushUndo(`Removed ${player.name} from ${team.name} (refund ${price} Cr)`);
    this._unassign(player, 'AVAILABLE');
    this._log('PLAYER_REMOVED_FROM_TEAM',
      `${player.name} removed from ${team.name}; ${price} Cr refunded`,
      { playerId: player.id, teamId: team.id, value: price });
    return {
      message: `${player.name} removed from ${team.name}, ${price} Cr refunded`,
      backup: `remove-${player.id}`,
      events: [{ type: 'STATE_CORRECTED', playerId: player.id }, { type: 'TEAM_UPDATED', teamId: team.id }],
    };
  },

  REMOVE_PLAYER({ playerId }) {
    const player = this.requirePlayer(playerId);
    if (this.state.currentPlayerId === player.id) {
      throw new AuctionError('Cannot remove the player currently in the auction', 'PLAYER_IN_AUCTION');
    }
    this._pushUndo(`Removed ${player.name} from the auction entirely`);
    if (player.status === 'SOLD') this._unassign(player, 'REMOVED');
    else player.status = 'REMOVED';
    this._log('PLAYER_REMOVED', `${player.name} removed from the auction`, { playerId: player.id });
    return {
      message: `${player.name} removed`,
      backup: `remove-player-${player.id}`,
      events: [{ type: 'PLAYER_CHANGED', playerId: player.id }],
    };
  },

  ASSIGN_CAPTAIN({ teamId, playerId }) {
    const team = this.requireTeam(teamId);
    if (!playerId) {
      this._pushUndo(`Cleared captain for ${team.name}`);
      const prev = this.player(team.captainId);
      if (prev) prev.isCaptain = false;
      team.captainId = '';
      this._log('CAPTAIN_UPDATED', `${team.name} captain cleared`, { teamId: team.id });
      return { message: `${team.name} captain cleared`, events: [{ type: 'CAPTAIN_UPDATED', teamId: team.id }] };
    }
    const player = this.requirePlayer(playerId);
    if (player.teamId !== team.id || player.status !== 'SOLD') {
      throw new AuctionError(`${player.name} is not in ${team.name}'s squad`, 'NOT_IN_SQUAD');
    }
    this._pushUndo(`Captain change for ${team.name}`);
    this.data.players.forEach((p) => { if (p.teamId === team.id) p.isCaptain = false; });
    player.isCaptain = true;
    team.captainId = player.id;
    this._log('CAPTAIN_UPDATED', `${player.name} is now captain of ${team.name}`,
      { playerId: player.id, teamId: team.id });
    return {
      message: `${player.name} is now ${team.name}'s captain`,
      events: [{ type: 'CAPTAIN_UPDATED', teamId: team.id, playerId: player.id }],
    };
  },

  ADJUST_PURSE({ teamId, purse }) {
    const team = this.requireTeam(teamId);
    const next = Number(purse);
    if (!Number.isFinite(next) || next < 0) throw new AuctionError('Purse must be zero or more', 'BAD_AMOUNT');
    this._pushUndo(`Purse adjust for ${team.name}: ${team.purse} -> ${next} Cr`);
    const before = team.purse;
    team.purse = next;
    this._log('PURSE_UPDATED', `${team.name} purse adjusted: ${before} Cr -> ${next} Cr`,
      { teamId: team.id, value: next, meta: { before, after: next } });
    return {
      message: `${team.name} purse set to ${next} Cr`,
      backup: `purse-${team.id}`,
      events: [{ type: 'PURSE_UPDATED', teamId: team.id }, { type: 'TEAM_UPDATED', teamId: team.id }],
    };
  },

  // ------------------------------------------------------------------- undo

  UNDO() {
    if (!this.undoStack.length) throw new AuctionError('Nothing to undo', 'NOTHING_TO_UNDO');
    const entry = this.undoStack.pop();
    const s = entry.snapshot;
    this.data.settings = s.settings;
    this.data.categories = s.categories;
    this.data.players = s.players;
    this.data.teams = s.teams;
    this.data.state = s.state;
    this._log('UNDO', `Undid: ${entry.label}`, { meta: { label: entry.label } });
    return {
      message: `Undone: ${entry.label}`,
      backup: 'pre-undo',
      events: [{ type: 'STATE_CORRECTED', undo: entry.label }],
    };
  },

  // --------------------------------------------------------------- editing

  EDIT_PLAYER({ playerId, fields }) {
    const p = this.requirePlayer(playerId);
    const f = fields || {};
    this._pushUndo(`Edited player ${p.name}`);
    const before = { ...p };
    if (f.name !== undefined) p.name = String(f.name);
    if (f.primaryCategory !== undefined) p.primaryCategory = String(f.primaryCategory);
    if (f.secondaryCategory !== undefined) p.secondaryCategory = String(f.secondaryCategory);
    if (f.role !== undefined) p.role = String(f.role);
    if (f.photo !== undefined) p.photo = String(f.photo);
    if (f.notes !== undefined) p.notes = String(f.notes);
    if (f.sequence !== undefined) p.sequence = Number(f.sequence) || 0;
    if (f.basePrice !== undefined) {
      const bp = Number(f.basePrice);
      if (!Number.isFinite(bp) || bp < 0) throw new AuctionError('Invalid base price', 'BAD_AMOUNT');
      if (p.status === 'SOLD') throw new AuctionError('Cannot change base price of a sold player', 'ALREADY_SOLD');
      p.basePrice = bp;
    }
    this._log('PLAYER_EDITED', `${before.name} edited`, { playerId: p.id, meta: { before: { name: before.name, basePrice: before.basePrice, primaryCategory: before.primaryCategory }, after: { name: p.name, basePrice: p.basePrice, primaryCategory: p.primaryCategory } } });
    return { message: `${p.name} updated`, events: [{ type: 'PLAYER_CHANGED', playerId: p.id }] };
  },

  ADD_PLAYER({ fields }) {
    const f = fields || {};
    if (!f.name) throw new AuctionError('Player name is required', 'BAD_INPUT');
    const maxNum = this.data.players.reduce((m, p) => {
      const n = parseInt(String(p.id).replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const cat = f.primaryCategory || (this.data.categories[0] || {}).name || 'B';
    const player = {
      id: 'P' + String(maxNum + 1).padStart(3, '0'),
      name: String(f.name), photo: f.photo || '',
      primaryCategory: cat, secondaryCategory: f.secondaryCategory || '',
      role: f.role || 'Batsman',
      basePrice: f.basePrice !== undefined ? Number(f.basePrice) : this.categoryPrice(cat),
      status: 'AVAILABLE', soldPrice: null, teamId: '', isCaptain: false,
      sequence: this.data.players.length + 1, notes: f.notes || '', timesAuctioned: 0,
    };
    this._pushUndo(`Added player ${player.name}`);
    this.data.players.push(player);
    this._log('PLAYER_ADDED', `Player added: ${player.name} (${player.primaryCategory})`, { playerId: player.id });
    return { message: `${player.name} added`, events: [{ type: 'PLAYER_CHANGED', playerId: player.id }] };
  },

  EDIT_TEAM({ teamId, fields }) {
    const t = this.requireTeam(teamId);
    const f = fields || {};
    this._pushUndo(`Edited team ${t.name}`);
    if (f.name !== undefined) t.name = String(f.name);
    if (f.owner !== undefined) t.owner = String(f.owner);
    if (f.color !== undefined) t.color = String(f.color);
    if (f.logo !== undefined) t.logo = String(f.logo);
    if (f.status !== undefined) t.status = f.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (f.minSquad !== undefined) t.minSquad = Number(f.minSquad) || t.minSquad;
    if (f.maxSquad !== undefined) t.maxSquad = Number(f.maxSquad) || t.maxSquad;
    if (f.startingPurse !== undefined) {
      const sp = Number(f.startingPurse);
      if (!Number.isFinite(sp) || sp < 0) throw new AuctionError('Invalid starting purse', 'BAD_AMOUNT');
      t.startingPurse = sp;
      t.purse = Math.max(0, sp - t.spent);
    }
    this._log('TEAM_UPDATED', `Team ${t.name} updated`, { teamId: t.id });
    return { message: `${t.name} updated`, events: [{ type: 'TEAM_UPDATED', teamId: t.id }] };
  },

  ADD_TEAM({ fields }) {
    const f = fields || {};
    if (!f.name) throw new AuctionError('Team name is required', 'BAD_INPUT');
    const maxNum = this.data.teams.reduce((m, t) => {
      const n = parseInt(String(t.id).replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const team = {
      id: 'T' + String(maxNum + 1).padStart(3, '0'),
      name: String(f.name), owner: f.owner || '', color: f.color || '#5b7cfa', logo: f.logo || '',
      startingPurse: f.startingPurse !== undefined ? Number(f.startingPurse) : this.settings.startingPurse,
      purse: f.startingPurse !== undefined ? Number(f.startingPurse) : this.settings.startingPurse,
      spent: 0, minSquad: this.settings.minSquad, maxSquad: this.settings.maxSquad,
      captainId: '', status: 'ACTIVE',
    };
    this._pushUndo(`Added team ${team.name}`);
    this.data.teams.push(team);
    this._log('TEAM_ADDED', `Team added: ${team.name}`, { teamId: team.id });
    return { message: `${team.name} added`, events: [{ type: 'TEAM_UPDATED', teamId: team.id }] };
  },

  DELETE_TEAM({ teamId }) {
    const t = this.requireTeam(teamId);
    if (this.squadSize(t.id) > 0) {
      throw new AuctionError(`${t.name} still has players - remove them first`, 'TEAM_NOT_EMPTY');
    }
    this._pushUndo(`Deleted team ${t.name}`);
    this.data.teams = this.data.teams.filter((x) => x.id !== t.id);
    this._log('TEAM_DELETED', `Team deleted: ${t.name}`, { teamId: t.id });
    return { message: `${t.name} deleted`, events: [{ type: 'TEAM_UPDATED' }] };
  },

  UPDATE_SETTINGS({ patch }) {
    const p = patch || {};
    this._pushUndo('Settings updated');
    const before = { ...this.settings };
    const numeric = ['startingPurse', 'minSquad', 'maxSquad', 'bidIncrement'];
    for (const [k, v] of Object.entries(p)) {
      if (!(k in this.settings)) continue;
      if (numeric.includes(k)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) throw new AuctionError(`Invalid value for ${k}`, 'BAD_AMOUNT');
        this.settings[k] = n;
      } else if (typeof this.settings[k] === 'boolean') {
        this.settings[k] = !!v;
      } else {
        this.settings[k] = v;
      }
    }
    if (this.settings.minSquad > this.settings.maxSquad) {
      this.settings = before;
      throw new AuctionError('Minimum squad cannot exceed maximum squad', 'BAD_INPUT');
    }
    // Propagate squad rules and (for untouched teams) the starting purse.
    this.data.teams.forEach((t) => {
      t.minSquad = this.settings.minSquad;
      t.maxSquad = this.settings.maxSquad;
      if (before.startingPurse !== this.settings.startingPurse) {
        t.startingPurse = this.settings.startingPurse;
        t.purse = Math.max(0, this.settings.startingPurse - t.spent);
      }
    });
    this._log('SETTINGS_UPDATED', 'Auction settings updated', { meta: { patch: p } });
    return { message: 'Settings saved', backup: 'settings', events: [{ type: 'SETTINGS_UPDATED' }] };
  },

  UPDATE_CATEGORIES({ categories }) {
    if (!Array.isArray(categories) || !categories.length) {
      throw new AuctionError('At least one category is required', 'BAD_INPUT');
    }
    const cleaned = categories.map((c, i) => {
      const price = Number(c.basePrice);
      if (!c.name || !Number.isFinite(price) || price <= 0) {
        throw new AuctionError('Every category needs a name and a base price above zero', 'BAD_INPUT');
      }
      return { name: String(c.name).trim(), basePrice: price, order: i };
    });
    this._pushUndo('Categories updated');
    const oldPrices = {};
    this.data.categories.forEach((c) => { oldPrices[c.name] = c.basePrice; });
    this.data.categories = cleaned;
    // Re-price only players who still carry their category default and are unsold.
    let repriced = 0;
    this.data.players.forEach((p) => {
      if (p.status === 'SOLD') return;
      const oldDefault = oldPrices[p.primaryCategory];
      const newDefault = this.categoryPrice(p.primaryCategory);
      if (newDefault && (p.basePrice === oldDefault || oldDefault === undefined)) {
        if (p.basePrice !== newDefault) { p.basePrice = newDefault; repriced++; }
      }
    });
    this._log('CATEGORIES_UPDATED', `Categories updated (${repriced} player base prices refreshed)`,
      { meta: { categories: cleaned } });
    return { message: `Categories saved, ${repriced} base prices refreshed`, backup: 'categories', events: [{ type: 'SETTINGS_UPDATED' }] };
  },

  // ---------------------------------------------------------------- utility

  CREATE_BACKUP({ label }) {
    return {
      message: 'Backup created',
      backup: label || 'manual',
      events: [{ type: 'BACKUP_CREATED' }],
      forceBackup: true,
    };
  },

  RESET_AUCTION({ confirm }) {
    if (confirm !== 'RESET') throw new AuctionError('Send confirm:"RESET" to wipe the auction', 'CONFIRM_REQUIRED');
    const seed = buildSeed();
    this.undoStack = [];
    const keepHistory = this.data.history.length;
    this.data = seed;
    this._log('AUCTION_RESET', `Auction reset to a fresh pool (discarded ${keepHistory} log entries)`);
    return { message: 'Auction reset', backup: 'pre-reset', events: [{ type: 'STATE_CORRECTED' }] };
  },
};

module.exports = { AuctionEngine, AuctionError, HANDLERS, AUCTION_STATES, PLAYER_STATES };
