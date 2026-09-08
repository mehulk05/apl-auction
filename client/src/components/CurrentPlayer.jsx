import React, { useEffect, useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Cat, PlayerPeek } from './ui.jsx';
import { Avatar, TeamCrest, IconClock, RoleIcon, CareerFull, timeAgo } from './graphics.jsx';

/**
 * The spotlight — broadcast style. Left: the player card (jersey, name
 * banner, stat tiles). Right: the money — current bid, highest bidder's
 * crest, and a live bid feed with "Ns ago" timestamps.
 */
export default function CurrentPlayer() {
  const { snapshot } = useAuction();
  const st = snapshot.state;
  const p = snapshot.currentPlayer;
  const bidding = st.status === 'BIDDING';
  const [peek, setPeek] = useState(false);

  // Keep the "16s ago" stamps ticking while bidding is live.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!bidding) return undefined;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [bidding]);

  const leader = snapshot.teams.find((t) => t.id === st.highestBidderTeamId);
  const feed = [...st.bidHistory].reverse().slice(0, 6);

  return (
    <section className="lot">
      <div className="lot-head">
        <span className="lot-no">
          {p ? `Lot ${String(p.sequence).padStart(2, '0')}` : 'No lot'} · Round {st.round}
        </span>
        <span className="state" data-s={st.status}>{st.status.replace('_', ' ')}</span>
      </div>

      <div className="spotlight">
        {/* ---------------- the player ---------------- */}
        <div className="spot-player">
          {p ? (
            <>
              <div className="spot-id">
                <Avatar name={p.name} color={leader ? leader.color : '#6b7280'} size={84} />
                <div style={{ minWidth: 0 }}>
                  <button type="button" className="name-banner" onClick={() => setPeek(true)}
                    title="Open the player profile">
                    {p.name}
                  </button>
                  <div className="row tight" style={{ marginTop: 9, flexWrap: 'wrap' }}>
                    <Cat value={p.primaryCategory} />
                    <span className="tag"><RoleIcon role={p.role} size={12} /> {p.role}</span>
                    {p.timesAuctioned > 1 ? <span className="tag warn">Re-offered</span> : null}
                  </div>
                </div>
              </div>

              <div className="spot-tiles">
                <div className="tile"><span className="k">Base price</span><b className="money">{cr(p.basePrice)}</b></div>
                <div className="tile"><span className="k">Tier</span><b>{p.primaryCategory}</b></div>
                <div className="tile"><span className="k">Role</span><b>{p.role}</b></div>
                <div className="tile"><span className="k">Lot no.</span><b className="mono-num">{String(p.sequence).padStart(2, '0')}</b></div>
              </div>

              <CareerFull player={p} />
            </>
          ) : (
            <div className="spot-empty">
              <div className="lot-name vacant">
                {st.status === 'COMPLETED' ? 'The sale has closed.' : 'Next lot coming up…'}
              </div>
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                {st.status === 'COMPLETED' ? 'Every result is in Sold and Unsold.' : 'The auctioneer opens the next lot from the catalogue.'}
              </p>
            </div>
          )}
        </div>

        {/* ---------------- the money ---------------- */}
        <div className="spot-money">
          <div className="bid-now">
            <span className="k">Current bid</span>
            {st.currentBid === null ? (
              <span className="v quiet">{p ? `opens at ${cr(p.basePrice)}` : '—'}</span>
            ) : (
              <span className="v money">{cr(st.currentBid)}</span>
            )}
            {leader ? (
              <span className="holder">
                <TeamCrest name={leader.name} color={leader.color} size={22} />
                {leader.name}
              </span>
            ) : (
              <span className="holder quiet">no bids yet</span>
            )}
            {bidding && st.nextBid !== null ? (
              <span className="next small muted">next valid bid <b className="money">{cr(st.nextBid)}</b></span>
            ) : null}
          </div>

          <div className="bid-feed">
            <div className="k"><IconClock /> Bid history{p ? ` — ${p.name.split(' ')[0]}` : ''}</div>
            {feed.length ? feed.map((b, i) => {
              const team = snapshot.teams.find((t) => t.id === b.teamId);
              return (
                <div className={`feed-row ${i === 0 ? 'lead' : ''}`} key={`${b.ts}-${i}`}>
                  <TeamCrest name={b.teamName} color={team ? team.color : '#5468FF'} size={26} />
                  <div className="feed-main">
                    <span className="who">{b.teamName} — raised to <b className="money">{cr(b.amount)}</b></span>
                    <span className="when">{timeAgo(b.ts, now)}</span>
                  </div>
                </div>
              );
            }) : <div className="feed-quiet">Bids land here the moment a paddle goes up.</div>}
          </div>
        </div>
      </div>

      {peek && p ? <PlayerPeek player={p} onClose={() => setPeek(false)} /> : null}
    </section>
  );
}
