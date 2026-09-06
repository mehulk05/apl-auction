import React from 'react';
import { Link } from 'react-router-dom';
import { useAuction, cr, clockTime } from '../lib/auction.jsx';
import CurrentPlayer from '../components/CurrentPlayer.jsx';
import AdminControls from '../components/AdminControls.jsx';
import BidPanel from '../components/BidPanel.jsx';
import TeamStrip from '../components/TeamStrip.jsx';

/**
 * The saleroom, kept simple: the lot, your one control surface, the teams.
 * Ledger, results and statistics have their own pages in the nav.
 */
export default function LiveAuction() {
  const { snapshot, isAdmin, role, connected } = useAuction();
  const st = snapshot.state;
  const stats = snapshot.stats;
  const last = snapshot.history[0];

  return (
    <div className="stack room">
      {!connected ? (
        <div className="notice bad"><b>Connection lost.</b> Reconnecting — the auctioneer's screen stays the record.</div>
      ) : null}
      {st.status === 'PAUSED' ? (
        <div className="notice warn"><b>Paused.</b> Bids are being refused until the auctioneer resumes.</div>
      ) : null}
      {!st.started && !isAdmin ? (
        <div className="notice"><b>The sale has not opened.</b> Waiting for the auctioneer.</div>
      ) : null}

      <CurrentPlayer />

      {isAdmin ? <AdminControls /> : null}
      {role === 'owner' ? <BidPanel /> : null}

      {last ? (
        <div className="ticker" title="Latest ledger entry">
          <span className="t">{clockTime(last.ts)}</span>
          <span className="m">{last.message}</span>
          <Link to="/history" className="lot-no">full ledger →</Link>
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <span className="eyebrow">Teams — click one for its squad &amp; balance</span>
          <span className="small muted">{cr(stats.totalPurseRemaining)} still in play</span>
        </div>
        <div className="card-body">
          <TeamStrip compact={role !== 'admin'} />
        </div>
      </section>

      <div className="tote">
        <Link to="/sold"><span className="k">Sold</span><b>{stats.sold}</b></Link>
        <Link to="/unsold"><span className="k">Unsold</span><b>{stats.unsold}</b></Link>
        <Link to="/players"><span className="k">To come</span><b>{stats.available}</b></Link>
        <Link to="/sold"><span className="k">Realised</span><b className="money">{cr(stats.totalSpent)}</b></Link>
        {stats.highestPurchase ? (
          <span><span className="k">Top price</span><b className="money">{cr(stats.highestPurchase.price)}</b>
            <span className="small muted" style={{ marginLeft: 6 }}>{stats.highestPurchase.player}</span></span>
        ) : null}
      </div>
    </div>
  );
}
