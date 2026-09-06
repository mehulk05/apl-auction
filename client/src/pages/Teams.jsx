import React from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { DataTable, Card, PageHead } from '../components/ui.jsx';
import { TeamCard } from '../components/TeamStrip.jsx';

export default function Teams() {
  const { snapshot } = useAuction();

  return (
    <div className="stack">
      <PageHead
        title="Teams"
        sub={`The ${snapshot.teams.length} franchises — purses, squads and how high each may still bid. Click a card for details.`}
        aside={<a className="btn sm ghost" href="/api/export/teams" download>teams.csv</a>}
      />
      <Card title="At a glance">
        <div className="teams-grid">
          {snapshot.teams.map((t) => <TeamCard key={t.id} team={t} />)}
        </div>
      </Card>

      <section className="card">
        <div className="card-body flush">
          <DataTable
            rows={snapshot.teams}
            initialSort={{ key: 'spent', dir: 'desc' }}
            columns={[
              { key: 'id', label: 'ID', mono: true },
              {
                key: 'name',
                label: 'Team',
                render: (t) => (
                  <span className="row tight">
                    <span className="dot" style={{ background: t.color }} />
                    <Link to={`/teams/${t.id}`}><b style={{ fontWeight: 600 }}>{t.name}</b></Link>
                  </span>
                ),
              },
              { key: 'owner', label: 'Owner' },
              { key: 'startingPurse', label: 'Opening purse', num: true, render: (t) => <span className="money">{cr(t.startingPurse)}</span> },
              { key: 'spent', label: 'Spent', num: true, render: (t) => <span className="money">{cr(t.spent)}</span> },
              { key: 'purse', label: 'Left', num: true, render: (t) => <b className="money">{cr(t.purse)}</b> },
              { key: 'squadSize', label: 'Squad', num: true, render: (t) => `${t.squadSize} / ${t.maxSquad}` },
              { key: 'needForMin', label: 'Short of min', num: true, render: (t) => (t.needForMin ? t.needForMin : '—') },
              { key: 'maxAllowedBid', label: 'Max bid', num: true, render: (t) => <span className="money">{cr(t.maxAllowedBid)}</span> },
              { key: 'captainName', label: 'Captain', render: (t) => t.captainName || '—' },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
