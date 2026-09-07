import React, { useMemo, useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { DataTable, Card, PageHead } from '../components/ui.jsx';

const TONE = {
  PLAYER_SOLD: 'good',
  PLAYER_UNSOLD: 'bad',
  UNDO: 'warn',
  ALLOCATION_CORRECTED: 'warn',
  PRICE_CHANGED: 'warn',
  PURSE_UPDATED: 'warn',
  AUCTION_PAUSED: 'warn',
  AUCTION_STARTED: 'good',
  PLAYER_REMOVED: 'bad',
  PLAYER_REMOVED_FROM_TEAM: 'bad',
};

const READABLE = (a) => a.toLowerCase().replace(/_/g, ' ');

export default function History() {
  const { snapshot } = useAuction();
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');

  const actions = useMemo(() => [...new Set(snapshot.history.map((h) => h.action))].sort(), [snapshot.history]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return snapshot.history
      .filter((h) => (!action || h.action === action))
      .filter((h) => (!needle || h.message.toLowerCase().includes(needle)));
  }, [snapshot.history, action, q]);

  if (!snapshot.settings.showAuctionHistory) {
    return (
      <section className="card"><div className="card-body">
        <div className="empty">The ledger is hidden in Admin settings.</div>
      </div></section>
    );
  }

  return (
    <div className="stack">
      <PageHead
        title="History"
        sub="The ledger — every bid, sale, correction and undo, newest first."
        aside={<a className="btn sm ghost" href="/api/export/transactions" download>transactions.csv</a>}
      />
      <Card title="Search the ledger">
        <div className="row">
          <input placeholder="Search the ledger" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Every kind of entry</option>
            {actions.map((a) => <option key={a} value={a}>{READABLE(a)}</option>)}
          </select>
          {(q || action) ? <button className="btn sm ghost" onClick={() => { setQ(''); setAction(''); }}>Clear filters</button> : null}
          <span className="spacer" />
          <span className="lot-no">{rows.length} entries · newest first</span>
        </div>
      </Card>

      <section className="card">
        <div className="card-body flush">
          <DataTable
            rows={rows}
            initialSort={{ key: 'ts', dir: 'desc' }}
            empty="Nothing recorded yet."
            columns={[
              { key: 'id', label: 'Entry', mono: true, hide: 'md' },
              { key: 'ts', label: 'Time', mono: true, render: (h) => new Date(h.ts).toLocaleTimeString([], { hour12: false }) },
              { key: 'action', label: 'Kind', render: (h) => <span className={`tag ${TONE[h.action] || ''}`}>{READABLE(h.action)}</span> },
              { key: 'message', label: 'What happened' },
              { key: 'value', label: 'Amount', num: true, render: (h) => (h.value === null || h.value === '' ? '—' : <span className="money">{cr(h.value)}</span>) },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
