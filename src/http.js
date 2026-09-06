'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { AuctionError } = require('./engine');
const { authorize, login } = require('./auth');
const { EXPORTS } = require('./csvExport');

function createApp(engine, auth) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();

  api.get('/health', (req, res) => {
    res.json({ ok: true, status: engine.state.status, saves: engine.repo.saveCount, uptime: process.uptime() });
  });

  // Full snapshot - also what a reconnecting client fetches (spec section 37).
  api.get('/state', (req, res) => res.json(engine.snapshot()));

  /** Password -> identity, for the login screen. */
  api.post('/login', (req, res) => {
    const result = login(auth, req.body || {});
    res.status(result.ok ? 200 : 401).json(result);
  });

  /** Single dispatcher: every mutation is POST /api/action { type, payload, key }. */
  api.post('/action', async (req, res) => {
    const { type, payload, key } = req.body || {};
    if (!type) return res.status(400).json({ ok: false, error: 'Missing action type', code: 'BAD_REQUEST' });
    const allowed = authorize(auth, type, payload, key);
    if (!allowed.ok) return res.status(401).json(allowed);
    try {
      const result = await engine.dispatch(type, payload || {});
      res.json({ ok: true, message: result.message, events: result.events, file: result.file });
    } catch (err) {
      if (err instanceof AuctionError) {
        return res.status(409).json({ ok: false, error: err.message, code: err.code });
      }
      console.error('[api] action failed', type, err);
      res.status(500).json({ ok: false, error: err.message, code: 'SERVER_ERROR' });
    }
  });

  api.get('/backups', async (req, res) => {
    res.json({ ok: true, backups: await engine.repo.listBackups() });
  });

  // CSV downloads: /api/export/players|teams|transactions|sold|auction
  api.get('/export/:kind', (req, res) => {
    const spec = EXPORTS[req.params.kind];
    if (!spec) {
      return res.status(404).json({ ok: false, error: 'Unknown export: ' + req.params.kind, available: Object.keys(EXPORTS) });
    }
    const csv = spec.fn(engine.data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${spec.file}"`);
    res.send(csv);
  });

  api.get('/export', (req, res) => res.json({ ok: true, available: Object.keys(EXPORTS) }));

  app.use('/api', api);

  // Serve the built React app when it exists.
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.status(200).type('html').send(
        '<h2>IPL Auction API is running</h2>' +
        '<p>The React client has not been built yet. Run <code>npm run build</code>, ' +
        'or <code>npm run dev</code> for the Vite dev server on port 5173.</p>' +
        '<p><a href="/api/state">/api/state</a></p>'
      );
    });
  }

  return app;
}

module.exports = { createApp };
