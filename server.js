'use strict';

const http = require('http');
const path = require('path');
const { AuctionEngine } = require('./src/engine');
const { loadOrCreateAuth } = require('./src/auth');
const { createApp } = require('./src/http');
const { attachRealtime } = require('./src/realtime');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.AUCTION_DATA_DIR || path.join(__dirname, 'data');

async function main() {
  const engine = new AuctionEngine({ dataDir: DATA_DIR });
  await engine.init();

  const auth = loadOrCreateAuth(DATA_DIR, engine.data.teams);

  const app = createApp(engine, auth);
  const server = http.createServer(app);
  attachRealtime(server, engine, auth);

  server.listen(PORT, () => {
    const s = engine.snapshot();
    console.log(`\n  IPL Auction server running on http://localhost:${PORT}`);
    console.log(`  data dir : ${DATA_DIR}`);
    console.log(`  players  : ${s.players.length}   teams: ${s.teams.length}   state: ${s.state.status}`);
    console.log(`  api      : http://localhost:${PORT}/api/state`);
    // On hosts with an ephemeral disk (e.g. Render free) auth.json is freshly
    // generated on every deploy - the startup log is where the owner reads it.
    console.log('\n  passwords (data/auth.json - keep this log private):');
    console.log(`    auctioneer : ${auth.admin}`);
    for (const t of engine.data.teams) {
      console.log(`    ${t.name.padEnd(12)}: ${auth.teams[t.id] || '(restart to generate)'}`);
    }
    console.log('');
  });

  const shutdown = (sig) => {
    console.log(`\n[server] ${sig} received, saving and shutting down...`);
    engine.repo.save(engine.data).finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { server, engine };
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[server] failed to start:', err);
    process.exit(1);
  });
}

module.exports = { main };
