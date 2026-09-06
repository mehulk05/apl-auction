import React, { useEffect, useRef, useState } from 'react';
import { TeamPeek } from '../components/ui.jsx';
import { useAuction, cr } from '../lib/auction.jsx';

/**
 * The saleroom itself — ink, not paper. Read-only, built for a projector at
 * the back of a room. Same faces as the catalogue, inverted.
 */
import { Link } from 'react-router-dom';

export default function Display() {
  const { snapshot, connected, isAdmin } = useAuction();
  const st = snapshot.state;
  const p = snapshot.currentPlayer;
  const [hammered, setHammered] = useState(false);
  const [peek, setPeek] = useState(null);
  const lastSold = useRef(snapshot.stats.sold);

  useEffect(() => {
    if (snapshot.stats.sold !== lastSold.current) {
      lastSold.current = snapshot.stats.sold;
      setHammered(true);
      const t = setTimeout(() => setHammered(false), 650);
      return () => clearTimeout(t);
    }
  }, [snapshot.stats.sold]);

  if (!snapshot.settings.enableProjectorMode) {
    return (
      <section className="card"><div className="card-body">
        <div className="empty">Projector mode is switched off in Admin settings.</div>
      </div></section>
    );
  }

  const lastResult = snapshot.history.find((h) => h.action === 'PLAYER_SOLD' || h.action === 'PLAYER_UNSOLD');

  return (
    <div className="bigscreen">
      <div className="bs-head">
        <span className="bs-title">{snapshot.settings.auctionName}</span>
        <span className="row tight">
          <span className="eyebrow">Round {st.round}</span>
          <span className="state" data-s={st.status}>{st.status.replace('_', ' ')}</span>
          {!connected ? <span className="tag bad">Reconnecting</span> : null}
        </span>
      </div>

      {isAdmin ? (
        <div className="bs-adminhint">
          This is the projector view — it only watches. Run the sale from the{' '}
          <Link to="/">Saleroom</Link>: put a lot on the block, open bidding, hammer it down.
        </div>
      ) : null}

      <div className="bs-stage">
        {p ? (
          <>
            <div className="bs-lotno">Lot {String(p.sequence).padStart(2, '0')}</div>
            <h1 className="bs-name">{p.name}</h1>
            <div className="bs-meta">
              <span className="tag">{p.primaryCategory}</span>
              <span className="tag">{p.role}</span>
              <span className="tag">Base {cr(p.basePrice)}</span>
            </div>

            <div className={`bs-figures ${hammered ? 'hammered' : ''}`}>
              <div className="bs-fig">
                <div className="k">Current bid</div>
                <div className="bs-bid money">{st.currentBid === null ? cr(p.basePrice) : cr(st.currentBid)}</div>
              </div>
              <div className="bs-fig">
                <div className="k">Highest bidder</div>
                <div className="bs-bidder">{st.highestBidderName || '—'}</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '4vh 0' }}>
            <h1 className="bs-name vacant">
              {st.status === 'COMPLETED' ? 'The sale has closed.' : 'Next lot coming up.'}
            </h1>
            {lastResult ? <div className="bs-bidder" style={{ fontSize: 'clamp(20px,3vw,40px)' }}>{lastResult.message}</div> : null}
          </div>
        )}
      </div>

      <div className="bs-teams">
        {snapshot.teams.map((t) => (
          <div className="bs-team clickable" key={t.id} role="button" tabIndex={0}
            onClick={() => setPeek(t.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPeek(t.id); } }}
            title={`See ${t.name}'s squad and balance`}>
            <div className="n"><span className="dot" style={{ background: t.color }} />{t.name}</div>
            <div className="f"><span>Purse</span><b className="money">{snapshot.settings.showTeamPursePublicly ? cr(t.purse) : '••••'}</b></div>
            <div className="f"><span>Squad</span><b>{t.squadSize} / {t.maxSquad}</b></div>
          </div>
        ))}
      </div>

      {peek ? <TeamPeek team={snapshot.teams.find((t) => t.id === peek)} onClose={() => setPeek(null)} /> : null}

      <div className="bs-tote">
        <div><div className="k">Sold</div><div className="v">{snapshot.stats.sold}</div></div>
        <div><div className="k">Unsold</div><div className="v">{snapshot.stats.unsold}</div></div>
        <div><div className="k">To come</div><div className="v">{snapshot.stats.available}</div></div>
        <div><div className="k">Total realised</div><div className="v brass money">{cr(snapshot.stats.totalSpent)}</div></div>
      </div>
    </div>
  );
}
