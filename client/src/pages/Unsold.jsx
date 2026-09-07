import React from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, DataTable, Fig, Card, PageHead } from '../components/ui.jsx';

export default function Unsold() {
  const { snapshot, isAdmin, action } = useAuction();
  const unsold = snapshot.players.filter((p) => p.status === 'UNSOLD');
  const removed = snapshot.players.filter((p) => p.status === 'REMOVED');
  const st = snapshot.state;
  const canReoffer = st.started && ['WAITING', 'SOLD', 'UNSOLD'].includes(st.status);

  return (
    <div className="stack">
      <PageHead
        title="Unsold"
        sub="Lots that found no buyer — re-offer one now, or run a whole unsold round."
        aside={isAdmin && unsold.length && snapshot.settings.allowUnsoldRound ? (
          <button className="btn sm primary" onClick={() => {
            if (confirm(`Return all ${unsold.length} unsold lots to the catalogue and begin round ${st.round + 1}?`)) {
              action('START_UNSOLD_ROUND');
            }
          }}>Re-offer all in round {st.round + 1}</button>
        ) : null}
      />
      <Card>
        <div className="figs">
          <Fig k="Unsold" v={unsold.length} />
          <Fig k="Current round" v={st.round} />
          <Fig k="Withdrawn" v={removed.length} />
        </div>
      </Card>

      <section className="card">
        <div className="card-body flush">
          <DataTable
            rows={unsold}
            initialSort={{ key: 'basePrice', dir: 'desc' }}
            empty="Every lot found a buyer."
            columns={[
              { key: 'sequence', label: 'Lot', num: true, mono: true, hide: 'sm' },
              { key: 'name', label: 'Player', render: (p) => <b style={{ fontWeight: 600 }}>{p.name}</b> },
              { key: 'primaryCategory', label: 'Category', hide: 'sm', render: (p) => <Cat value={p.primaryCategory} /> },
              { key: 'role', label: 'Role', hide: 'sm' },
              { key: 'basePrice', label: 'Base price', num: true, render: (p) => <span className="money">{cr(p.basePrice)}</span> },
              { key: 'timesAuctioned', label: 'Times offered', num: true, hide: 'sm' },
              ...(isAdmin ? [{
                key: 'act',
                label: '',
                sortable: false,
                render: (p) => (
                  <div className="row tight">
                    <button className="btn sm primary" disabled={!canReoffer}
                      title={canReoffer ? '' : 'Settle the current lot first'}
                      onClick={() => action('REAUCTION_PLAYER', { playerId: p.id })}>Put on the block</button>
                    <button className="btn sm" onClick={() => action('RETURN_TO_POOL', { playerId: p.id })}>Back to catalogue</button>
                    <button className="btn sm danger"
                      onClick={() => { if (confirm(`Withdraw ${p.name} from this sale entirely?`)) action('REMOVE_PLAYER', { playerId: p.id }); }}>
                      Withdraw
                    </button>
                  </div>
                ),
              }] : []),
            ]}
          />
        </div>
      </section>

      {removed.length ? (
        <Card title={`Withdrawn · ${removed.length}`} flush>
          <DataTable
            rows={removed}
            initialSort={{ key: 'name', dir: 'asc' }}
            columns={[
              { key: 'sequence', label: 'Lot', num: true, mono: true, hide: 'sm' },
              { key: 'name', label: 'Player' },
              { key: 'primaryCategory', label: 'Category', hide: 'sm', render: (p) => <Cat value={p.primaryCategory} /> },
              { key: 'basePrice', label: 'Base price', num: true, render: (p) => <span className="money">{cr(p.basePrice)}</span> },
              ...(isAdmin ? [{
                key: 'act', label: '', sortable: false,
                render: (p) => <button className="btn sm" onClick={() => action('RETURN_TO_POOL', { playerId: p.id })}>Restore</button>,
              }] : []),
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}
