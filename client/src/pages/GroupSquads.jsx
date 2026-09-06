import React from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, Card, PageHead } from '../components/ui.jsx';

/** Every squad on one page. Made for the projector — updates live. */
export default function GroupSquads() {
  const { snapshot } = useAuction();

  return (
    <div className="stack">
      <PageHead
        title="Squads"
        sub="Every team's full squad on one live page — made for a shared screen."
        aside={
          <span className="small muted">
            {snapshot.stats.sold} sold · {cr(snapshot.stats.totalSpent)} realised · {cr(snapshot.stats.totalPurseRemaining)} still in play
          </span>
        }
      />
      <Card>
        <div className="grid-squads" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
          {snapshot.teams.map((t) => (
            <article className="card" key={t.id} style={{ boxShadow: 'none' }}>
              <div className="card-head">
                <span>
                  <span className="row tight">
                    <span className="dot" style={{ background: t.color }} />
                    <Link to={`/teams/${t.id}`}><b style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</b></Link>
                  </span>
                  <span className="team-owner">{t.owner}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="money" style={{ fontSize: 17, fontWeight: 700, display: 'block' }}>{cr(t.purse)}</span>
                  <span className="lot-no">{t.squadSize} of {t.maxSquad}</span>
                </span>
              </div>

              <div className="card-body flush">
                {t.squad.length ? (
                  <table className="data">
                    <tbody>
                      {t.squad.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            {p.isCaptain ? <span className="tag warn" style={{ marginLeft: 7 }}>C</span> : null}
                          </td>
                          <td style={{ width: 44 }}><Cat value={p.primaryCategory} /></td>
                          <td className="num"><b className="money">{cr(p.soldPrice)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="empty" style={{ padding: 28, fontSize: 14 }}>Nothing bought yet.</div>}
              </div>

              <div className="card-head" style={{ borderBottom: 'none', borderTop: '1px solid var(--rule-soft)', background: 'transparent' }}>
                <span className="small muted">Spent {cr(t.spent)}</span>
                <span className="small muted">
                  {t.squadSize >= t.minSquad ? `minimum of ${t.minSquad} met` : `${t.needForMin} more needed`}
                </span>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
