import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, DataTable, Fig, Card, PageHead } from '../components/ui.jsx';

export default function Sold() {
  const { snapshot } = useAuction();
  const [team, setTeam] = useState('');
  const [cat, setCat] = useState('');
  const [role, setRole] = useState('');
  const [minPrice, setMinPrice] = useState('');

  const roles = useMemo(() => [...new Set(snapshot.players.map((p) => p.role))].filter(Boolean).sort(), [snapshot.players]);

  const sold = useMemo(() => snapshot.players
    .filter((p) => p.status === 'SOLD')
    .filter((p) => (!team || p.teamId === team))
    .filter((p) => (!cat || p.primaryCategory === cat))
    .filter((p) => (!role || p.role === role))
    .filter((p) => (!minPrice || (p.soldPrice || 0) >= Number(minPrice)))
    .map((p) => ({ ...p, premium: (p.soldPrice || 0) - p.basePrice })),
  [snapshot.players, team, cat, role, minPrice]);

  const total = sold.reduce((s, p) => s + (p.soldPrice || 0), 0);
  const dirty = team || cat || role || minPrice;

  return (
    <div className="stack">
      <PageHead
        title="Sold"
        sub="Every hammer that has fallen — who bought whom, and for how much over base."
        aside={<a className="btn sm ghost" href="/api/export/sold" download>sold-players.csv</a>}
      />
      <Card title="Totals & filters">
        <div className="figs">
          <Fig k="Shown" v={sold.length} sub={`of ${snapshot.stats.sold} sold`} />
          <Fig k="Realised" v={cr(total)} serif />
          <Fig k="Average" v={cr(sold.length ? Math.round((total / sold.length) * 100) / 100 : 0)} serif />
          <Fig k="Top price" v={snapshot.stats.highestPurchase ? cr(snapshot.stats.highestPurchase.price) : '—'} serif
            sub={snapshot.stats.highestPurchase ? snapshot.stats.highestPurchase.player : ''} />
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Any team</option>
            {snapshot.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Any category</option>
            {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Any role</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="number" min="0" placeholder="Min price" value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)} style={{ width: 118 }} />
          {dirty ? (
            <button className="btn sm ghost" onClick={() => { setTeam(''); setCat(''); setRole(''); setMinPrice(''); }}>Clear filters</button>
          ) : null}
        </div>
      </Card>

      <section className="card">
        <div className="card-body flush">
          <DataTable
            rows={sold}
            initialSort={{ key: 'soldPrice', dir: 'desc' }}
            empty="Nothing sold yet."
            columns={[
              { key: 'sequence', label: 'Lot', num: true, mono: true, hide: 'sm' },
              { key: 'name', label: 'Player', render: (p) => <b style={{ fontWeight: 600 }}>{p.name}</b> },
              { key: 'primaryCategory', label: 'Category', hide: 'sm', render: (p) => <Cat value={p.primaryCategory} /> },
              { key: 'role', label: 'Role', hide: 'sm' },
              { key: 'teamName', label: 'Bought by', render: (p) => <Link to={`/teams/${p.teamId}`}>{p.teamName}</Link> },
              { key: 'basePrice', label: 'Base price', num: true, hide: 'sm', render: (p) => <span className="money muted">{cr(p.basePrice)}</span> },
              { key: 'soldPrice', label: 'Hammer price', num: true, render: (p) => <b className="money" style={{ fontWeight: 700, fontSize: 14.5 }}>{cr(p.soldPrice)}</b> },
              {
                key: 'premium',
                label: 'Over base',
                hide: 'sm',
                num: true,
                render: (p) => (p.premium > 0
                  ? <span className="money" style={{ color: 'var(--brass)' }}>+{cr(p.premium)}</span>
                  : <span className="muted">at base</span>),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
