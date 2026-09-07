import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { DataTable, Card, PageHead } from '../components/ui.jsx';
import { TeamCard } from '../components/TeamStrip.jsx';
import { TeamEditor } from '../components/editors.jsx';

export default function Teams() {
  const { snapshot, isAdmin, action } = useAuction();
  const [editor, setEditor] = useState(undefined); // undefined closed, null = add, object = edit

  return (
    <div className="stack">
      <PageHead
        title="Teams"
        sub={`The ${snapshot.teams.length} franchises — purses, squads and how high each may still bid. Click a card for details.`}
        aside={
          <span className="row tight">
            {isAdmin ? <button className="btn sm primary" onClick={() => setEditor(null)}>Add team</button> : null}
            <a className="btn sm ghost" href="/api/export/teams" download>teams.csv</a>
          </span>
        }
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
              ...(isAdmin ? [{
                key: 'act',
                label: '',
                sortable: false,
                render: (t) => (
                  <div className="row tight">
                    <button className="btn sm" onClick={() => setEditor(t)}>Edit</button>
                    <button className="btn sm ghost" onClick={() => {
                      const v = prompt(`Set ${t.name}'s remaining purse (Cr). Currently ${t.purse}.`, t.purse);
                      if (v !== null) action('ADJUST_PURSE', { teamId: t.id, purse: Number(v) });
                    }}>Purse</button>
                  </div>
                ),
              }] : []),
            ]}
          />
        </div>
      </section>

      {editor !== undefined ? <TeamEditor team={editor} onClose={() => setEditor(undefined)} /> : null}
    </div>
  );
}
