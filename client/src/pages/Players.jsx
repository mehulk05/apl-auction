import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, StatusTag, DataTable, Card, PageHead } from '../components/ui.jsx';

const STATUSES = [
  ['AVAILABLE', 'In catalogue'],
  ['IN_AUCTION', 'On the block'],
  ['SOLD', 'Sold'],
  ['UNSOLD', 'Unsold'],
  ['REMOVED', 'Withdrawn'],
];

export default function Players() {
  const { snapshot } = useAuction();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');

  const roles = useMemo(() => [...new Set(snapshot.players.map((p) => p.role))].filter(Boolean).sort(), [snapshot.players]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return snapshot.players.filter((p) => (
      (!status || p.status === status)
      && (!cat || p.primaryCategory === cat || p.secondaryCategory === cat)
      && (!role || p.role === role)
      && (!team || p.teamId === team)
      && (!needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle))
    ));
  }, [snapshot.players, q, status, cat, role, team]);

  const counts = useMemo(() => {
    const c = {};
    STATUSES.forEach(([s]) => { c[s] = snapshot.players.filter((p) => p.status === s).length; });
    return c;
  }, [snapshot.players]);

  const dirty = q || status || cat || role || team;

  return (
    <div className="stack">
      <PageHead
        title="Players"
        sub={`All ${snapshot.players.length} lots in this sale — search, or filter by status, category, role and team.`}
        aside={<a className="btn sm ghost" href="/api/export/players" download>players.csv</a>}
      />
      <Card title="Find a player">
        <div className="row">
          <input placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map(([s, label]) => <option key={s} value={s}>{label} ({counts[s]})</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Any category</option>
            {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name} — {cr(c.basePrice)}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Any role</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Any team</option>
            {snapshot.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {dirty ? (
            <button className="btn sm ghost" onClick={() => { setQ(''); setStatus(''); setCat(''); setRole(''); setTeam(''); }}>
              Clear filters
            </button>
          ) : null}
          <span className="spacer" />
          <span className="lot-no">{rows.length} shown</span>
        </div>
      </Card>

      <section className="card">
        <div className="card-body flush">
          <DataTable
            rows={rows}
            initialSort={{ key: 'sequence', dir: 'asc' }}
            empty="No lots match those filters."
            columns={[
              { key: 'sequence', label: 'Lot', num: true, mono: true },
              { key: 'id', label: 'ID', mono: true },
              { key: 'name', label: 'Player', render: (p) => <b style={{ fontWeight: 600 }}>{p.name}</b> },
              { key: 'primaryCategory', label: 'Category', render: (p) => <Cat value={p.primaryCategory} /> },
              { key: 'secondaryCategory', label: 'Second', render: (p) => (p.secondaryCategory ? <Cat value={p.secondaryCategory} /> : '—') },
              { key: 'role', label: 'Role' },
              { key: 'basePrice', label: 'Base price', num: true, render: (p) => <span className="money">{cr(p.basePrice)}</span> },
              { key: 'status', label: 'Status', render: (p) => <StatusTag status={p.status} /> },
              { key: 'teamName', label: 'Team', render: (p) => (p.teamId ? <Link to={`/teams/${p.teamId}`}>{p.teamName}</Link> : '—') },
              { key: 'soldPrice', label: 'Sold for', num: true, render: (p) => (p.soldPrice === null ? '—' : <b className="money">{cr(p.soldPrice)}</b>) },
              { key: 'timesAuctioned', label: 'Offered', num: true },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
