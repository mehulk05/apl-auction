'use strict';

const { Server } = require('socket.io');
const { AuctionError } = require('./engine');
const { authorize } = require('./auth');

/**
 * Socket.IO layer. Clients only ever send action requests; the server answers
 * with an ack and broadcasts the authoritative snapshot to everyone.
 */
function attachRealtime(httpServer, engine, auth) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  engine.onChange = (snapshot, events) => {
    io.emit('snapshot', snapshot);
    for (const ev of events || []) io.emit('auction:event', ev);
  };

  io.on('connection', (socket) => {
    // A fresh or reconnecting client gets the complete current state, never a
    // replay of missed messages (spec section 37).
    socket.emit('snapshot', engine.snapshot());
    socket.emit('hello', { id: socket.id, serverTime: new Date().toISOString() });

    socket.on('identify', (who, ack) => {
      socket.data.role = (who && who.role) || 'spectator';
      socket.data.teamId = (who && who.teamId) || '';
      if (typeof ack === 'function') ack({ ok: true, role: socket.data.role, teamId: socket.data.teamId });
    });

    socket.on('action', async (msg, ack) => {
      const type = msg && msg.type;
      const payload = (msg && msg.payload) || {};
      const key = msg && msg.key;
      if (!type) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Missing action type', code: 'BAD_REQUEST' });
        return;
      }
      const allowed = authorize(auth, type, payload, key);
      if (!allowed.ok) {
        if (typeof ack === 'function') ack(allowed);
        if (type === 'PLACE_BID') {
          socket.emit('auction:event', { type: 'BID_REJECTED', teamId: payload.teamId, error: allowed.error, code: allowed.code });
        }
        return;
      }
      try {
        const result = await engine.dispatch(type, payload);
        if (typeof ack === 'function') ack({ ok: true, message: result.message, events: result.events, file: result.file });
      } catch (err) {
        const isAuction = err instanceof AuctionError;
        const res = { ok: false, error: err.message, code: isAuction ? err.code : 'SERVER_ERROR' };
        if (!isAuction) console.error('[socket] action failed', type, err);
        if (typeof ack === 'function') ack(res);
        // Tell the rejected bidder's own screen, and let displays show it too.
        if (type === 'PLACE_BID') {
          socket.emit('auction:event', {
            type: 'BID_REJECTED', teamId: payload.teamId, amount: payload.amount,
            error: err.message, code: res.code,
          });
        }
      }
    });

    socket.on('request:snapshot', (_, ack) => {
      const snap = engine.snapshot();
      if (typeof ack === 'function') ack({ ok: true, snapshot: snap });
      else socket.emit('snapshot', snap);
    });
  });

  return io;
}

module.exports = { attachRealtime };
