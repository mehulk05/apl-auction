import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, DataTable, Fig, Card } from '../components/ui.jsx';
import { TeamEditor } from '../components/editors.jsx';

export default function TeamDetail() {
  const { teamId } = useParams();
  const { snapshot, isAdmin, action } = useAuction();
  const [editing, setEditing] = useState(false);
  const team = snapshot.teams.find((t) => t.id === teamId);

  if (!team) {
    return (
      <section className="card"><div className="card-body">
        <div className="empty">No such team. <Link to="/teams">Back to teams</Link></div>
      </div></section>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-body">
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row tight">
                <span className="dot" style={{ background: team.color, width: 11, height: 11 }} />
                <h1 className="lot-name" style={{ fontSize: 34 }}>{team.name}</h1>
              </div>
              <div className="team-owner" style={{ marginTop: 8 }}>{team.owner || 'no owner'} · {team.id} · {team.status.toLowerCase()}</div>
            </div>
            <div className="row tight">
              {team.captainName
                ? <span className="tag warn">Captain · {team.captainName}</span>
                : <span className="tag">No captain named</span>}
              {isAdmin ? (
                <>
                  <button className="btn sm" onClick={() => setEditing(true)}>Edit team</button>
                  <button className="btn sm ghost" onClick={() => {
                    const v = prompt(`Set ${team.name}'s remaining purse (Cr). Currently ${team.purse}.`, team.purse);
                    if (v !== null) action('ADJUST_PURSE', { teamId: team.id, purse: Number(v) });
                  }}>Adjust purse</button>
                </>
              ) : null}
            </div>
          </div>

          <div className="figs" style={{ marginTop: 20 }}>
            <Fig k="Opening purse" v={cr(team.startingPurse)} serif />
            <Fig k="Spent" v={cr(team.spent)} serif />
            <Fig k="Left" v={cr(team.purse)} serif />
            <Fig k="Squad" v={`${team.squadSize} / ${team.maxSquad}`}
              sub={team.squadSize >= team.minSquad ? `minimum of ${team.minSquad} met` : `${team.needForMin} more needed`} />
            <Fig k="Most they may bid" v={cr(team.maxAllowedBid)} serif />
            <Fig k="Slots open" v={team.slotsLeft} />
          </div>
        </div>
      </section>

      <Card
        title={`Squad · ${team.squad.length}`}
        aside={team.squadSize >= team.minSquad
          ? <span className="tag good">Minimum met</span>
          : <span className="tag warn">{team.needForMin} more needed</span>}
        flush
      >
        <DataTable
          rows={team.squad}
          initialSort={{ key: 'soldPrice', dir: 'desc' }}
          empty="No lots bought yet."
          columns={[
            { key: 'name', label: 'Player', render: (p) => <span><b style={{ fontWeight: 600 }}>{p.name}</b>{p.isCaptain ? <span className="tag warn" style={{ marginLeft: 8 }}>Captain</span> : null}</span> },
            { key: 'primaryCategory', label: 'Category', render: (p) => <Cat value={p.primaryCategory} /> },
            { key: 'role', label: 'Role', hide: 'sm' },
            { key: 'basePrice', label: 'Base price', num: true, hide: 'sm', render: (p) => <span className="money">{cr(p.basePrice)}</span> },
            { key: 'soldPrice', label: 'Paid', num: true, render: (p) => <b className="money">{cr(p.soldPrice)}</b> },
            ...(isAdmin ? [{
              key: 'act',
              label: '',
              sortable: false,
              render: (p) => (
                <div className="row tight">
                  <button className="btn sm" disabled={p.isCaptain}
                    onClick={() => action('ASSIGN_CAPTAIN', { teamId: team.id, playerId: p.id })}>Name captain</button>
                  <button className="btn sm danger"
                    onClick={() => { if (confirm(`Take ${p.name} off ${team.name} and refund ${cr(p.soldPrice)}?`)) action('REMOVE_FROM_TEAM', { playerId: p.id }); }}>
                    Release
                  </button>
                </div>
              ),
            }] : []),
          ]}
        />
      </Card>

      {editing ? <TeamEditor team={team} onClose={() => setEditing(false)} /> : null}

      {isAdmin && team.captainId ? (
        <div className="row">
          <button className="btn sm ghost" onClick={() => action('ASSIGN_CAPTAIN', { teamId: team.id, playerId: '' })}>
            Remove captaincy
          </button>
        </div>
      ) : null}
    </div>
  );
}
