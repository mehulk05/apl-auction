'use strict';

const { serializeRows, COLUMNS } = require('./csv');

function simpleCsv(header, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}

function playersCsv(data) {
  const teamName = (id) => (data.teams.find((t) => t.id === id) || {}).name || '';
  return simpleCsv(
    ['player_id', 'name', 'primary_category', 'secondary_category', 'role', 'base_price',
      'status', 'assigned_team_id', 'assigned_team', 'sold_price', 'is_captain',
      'auction_sequence', 'times_auctioned', 'notes'],
    data.players.map((p) => [
      p.id, p.name, p.primaryCategory, p.secondaryCategory, p.role, p.basePrice,
      p.status, p.teamId, teamName(p.teamId), p.soldPrice === null ? '' : p.soldPrice,
      p.isCaptain ? 'true' : 'false', p.sequence, p.timesAuctioned, p.notes,
    ])
  );
}

function teamsCsv(data) {
  const squadSize = (id) => data.players.filter((p) => p.teamId === id && p.status === 'SOLD').length;
  const captainName = (id) => (data.players.find((p) => p.id === id) || {}).name || '';
  return simpleCsv(
    ['team_id', 'name', 'owner', 'starting_purse', 'spent', 'remaining_purse',
      'squad_size', 'min_squad', 'max_squad', 'captain_id', 'captain', 'status'],
    data.teams.map((t) => [
      t.id, t.name, t.owner, t.startingPurse, t.spent, t.purse,
      squadSize(t.id), t.minSquad, t.maxSquad, t.captainId, captainName(t.captainId), t.status,
    ])
  );
}

function transactionsCsv(data) {
  return simpleCsv(
    ['transaction_id', 'timestamp', 'action', 'player_id', 'team_id', 'value', 'message'],
    data.history.map((h) => [h.id, h.ts, h.action, h.playerId || '', h.teamId || '',
      h.value === null || h.value === undefined ? '' : h.value, h.message]),
  );
}

function soldCsv(data) {
  const teamName = (id) => (data.teams.find((t) => t.id === id) || {}).name || '';
  const sold = data.players
    .filter((p) => p.status === 'SOLD')
    .sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0));
  return simpleCsv(
    ['rank', 'player_id', 'player', 'category', 'role', 'base_price', 'team', 'sold_price'],
    sold.map((p, i) => [i + 1, p.id, p.name, p.primaryCategory, p.role, p.basePrice,
      teamName(p.teamId), p.soldPrice]),
  );
}

/**
 * Single-file export in the spec's record_type schema (spec section 32).
 * Kept as an export rather than the live store so nested data never has to be
 * flattened into 19 fixed columns during the auction itself.
 */
function combinedAuctionCsv(data) {
  const rows = [];

  Object.entries(data.settings).forEach(([k, v]) => {
    rows.push({ record_type: 'SETTING', id: k, value: String(v) });
  });

  data.categories.forEach((c) => {
    rows.push({ record_type: 'CATEGORY', id: c.name, base_price: c.basePrice, value: c.order });
  });

  const squadSize = (id) => data.players.filter((p) => p.teamId === id && p.status === 'SOLD').length;
  data.teams.forEach((t) => {
    rows.push({
      record_type: 'TEAM', id: t.id, name: t.name, status: t.status,
      purse: t.purse, starting_purse: t.startingPurse, squad_size: squadSize(t.id),
      captain: t.captainId, value: t.spent,
      metadata: JSON.stringify({ owner: t.owner, color: t.color, logo: t.logo, minSquad: t.minSquad, maxSquad: t.maxSquad }),
    });
  });

  data.players.forEach((p) => {
    rows.push({
      record_type: 'PLAYER', id: p.id, name: p.name, team_id: p.teamId,
      primary_category: p.primaryCategory, secondary_category: p.secondaryCategory,
      role: p.role, base_price: p.basePrice, status: p.status,
      sold_price: p.soldPrice === null ? '' : p.soldPrice,
      captain: p.isCaptain ? 'true' : 'false', value: p.sequence,
      metadata: JSON.stringify({ photo: p.photo, notes: p.notes, timesAuctioned: p.timesAuctioned }),
    });
  });

  rows.push({
    record_type: 'STATE', id: 'STATE', status: data.state.status,
    player_id: data.state.currentPlayerId, team_id: data.state.highestBidderTeamId,
    sold_price: data.state.currentBid === null ? '' : data.state.currentBid,
    value: data.state.round,
    metadata: JSON.stringify({
      started: data.state.started, pausedFrom: data.state.pausedFrom,
      startedAt: data.state.startedAt, completedAt: data.state.completedAt,
    }),
  });

  data.history.forEach((h) => {
    rows.push({
      record_type: 'TRANSACTION', id: h.id, name: h.message, player_id: h.playerId || '',
      team_id: h.teamId || '', timestamp: h.ts, action: h.action,
      value: h.value === null || h.value === undefined ? '' : h.value,
      metadata: h.meta ? JSON.stringify(h.meta) : '',
    });
  });

  return serializeRows(rows);
}

const EXPORTS = {
  players: { fn: playersCsv, file: 'players.csv' },
  teams: { fn: teamsCsv, file: 'teams.csv' },
  transactions: { fn: transactionsCsv, file: 'transactions.csv' },
  sold: { fn: soldCsv, file: 'sold-players.csv' },
  auction: { fn: combinedAuctionCsv, file: 'auction.csv' },
};

module.exports = { EXPORTS, playersCsv, teamsCsv, transactionsCsv, soldCsv, combinedAuctionCsv, COLUMNS };
