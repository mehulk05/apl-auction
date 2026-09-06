import React from 'react';
import { useAuction, cr, clockTime } from '../lib/auction.jsx';
import { Cat } from './ui.jsx';

/**
 * The lot plate — the signature element. A catalogue entry: lot number,
 * name set in the display face, metadata line, then the two figures that
 * decide everything, then the ladder showing how the bid actually climbed.
 */
export default function CurrentPlayer() {
  const { snapshot } = useAuction();
  const st = snapshot.state;
  const p = snapshot.currentPlayer;
  const bidding = st.status === 'BIDDING';

  return (
    <section className="lot">
      <div className="lot-head">
        <span className="lot-no">
          {p ? `Lot ${String(p.sequence).padStart(2, '0')}` : 'No lot'} · Round {st.round}
        </span>
        <span className="state" data-s={st.status}>{st.status.replace('_', ' ')}</span>
      </div>

      <div className="lot-body">
        {p ? (
          <>
            <h1 className="lot-name">{p.name}</h1>
            <div className="lot-meta">
              <Cat value={p.primaryCategory} />
              {p.secondaryCategory ? <Cat value={p.secondaryCategory} /> : null}
              <span className="small">{p.role}</span>
              <span className="sep-dot">/</span>
              <span className="small">Base price <b className="money">{cr(p.basePrice)}</b></span>
              <span className="sep-dot">/</span>
              <span className="lot-no">{p.id}</span>
              {p.timesAuctioned > 1 ? <span className="tag warn">Re-offered · {p.timesAuctioned}nd time</span> : null}
            </div>
          </>
        ) : (
          <>
            <h1 className="lot-name vacant">
              {st.status === 'COMPLETED' ? 'The sale has closed.' : 'No lot on the block.'}
            </h1>
            <div className="lot-meta">
              <span className="small muted">
                {st.status === 'COMPLETED'
                  ? 'Every result is in Sold and Unsold.'
                  : 'The auctioneer opens the next lot from the catalogue.'}
              </span>
            </div>
          </>
        )}

        <div className="figures">
          <div>
            <div className="eyebrow">Current bid</div>
            {st.currentBid === null ? (
              <div className="figure-v quiet">{p ? `opens at ${cr(p.basePrice)}` : 'no bidding'}</div>
            ) : (
              <div className="figure-v live money">{cr(st.currentBid)}</div>
            )}
            {bidding && st.nextBid !== null ? (
              <div className="figure-note">Next valid bid <b className="money">{cr(st.nextBid)}</b> · steps of {cr(snapshot.settings.bidIncrement)}</div>
            ) : null}
          </div>
          <div>
            <div className="eyebrow">Highest bidder</div>
            {st.highestBidderName ? (
              <div className="figure-v bidder">{st.highestBidderName}</div>
            ) : (
              <div className="figure-v quiet">no bids yet</div>
            )}
            {st.highestBidderName ? (
              <div className="figure-note">{st.bidHistory.length} bid{st.bidHistory.length === 1 ? '' : 's'} on this lot</div>
            ) : null}
          </div>
        </div>

        {st.bidHistory.length ? (
          <div className="ladder">
            <div className="eyebrow">How the bidding climbed</div>
            <div className="ladder-rail">
              {st.bidHistory.map((b, i) => (
                <div className="rung" key={i} title={clockTime(b.ts)}>
                  <span className="amt money">{cr(b.amount)}</span>
                  <span className="who">{b.teamName}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
