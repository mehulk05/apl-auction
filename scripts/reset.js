'use strict';
// Wipe the auction back to a fresh 64-player pool. Keeps existing backups.
const fs = require('fs');
const path = require('path');
const { AuctionEngine } = require('../src/engine');

const dataDir = process.env.AUCTION_DATA_DIR || path.join(__dirname, '..', 'data');

(async () => {
  const engine = new AuctionEngine({ dataDir });
  await engine.init();
  if (fs.existsSync(engine.repo.file)) await engine.repo.backup(engine.data, 'pre-reset-cli');
  await engine.dispatch('RESET_AUCTION', { confirm: 'RESET' });
  const s = engine.snapshot();
  console.log(`reset complete -> ${s.players.length} players, ${s.teams.length} teams, state ${s.state.status}`);
  console.log('restart the server (or it will keep serving its in-memory copy)');
})().catch((e) => { console.error(e); process.exit(1); });
