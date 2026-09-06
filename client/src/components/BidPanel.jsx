import React from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Card } from './ui.jsx';

/** The owner's paddle. One button, one legal amount. */
export default function BidPanel() {
  const { snapshot, myTeam, action, teamId } = useAuction();
  const st = snapshot.state;

  if (!teamId) {
    return (
      <Card title="Your paddle">
        <p className="small muted" style={{ margin: 0 }}>Choose your team in the top bar to start bidding.</p>
      </Card>
    );
  }
  if (!myTeam) {
    return <Card title="Your paddle"><p className="small muted" style={{ margin: 0 }}>That team no longer exists.</p></Card>;
  }

  const nextBid = st.nextBid;
  const canBid = myTeam.canBid && nextBid !== null;

  return (
    <Card
      title={myTeam.name}
      aside={<span className="row tight"><span className="dot" style={{ background: myTeam.color }} /><span className="lot-no">{myTeam.owner}</span></span>}
    >
      <button
        className="btn paddle"
        disabled={!canBid}
        onClick={() => action('PLACE_BID', { teamId: myTeam.id, amount: nextBid }, { quiet: true })}
      >
        <span className="paddle-k">{canBid ? 'Bid' : 'Cannot bid'}</span>
        <span className="paddle-v money">{canBid ? cr(nextBid) : '—'}</span>
      </button>

      <p className="small" style={{ margin: '11px 0 0', color: canBid ? 'var(--ink-3)' : 'var(--brass)' }}>
        {canBid
          ? `You are bidding on ${snapshot.currentPlayer.name}. Bids rise in ${cr(snapshot.settings.bidIncrement)} steps.`
          : myTeam.bidBlockedReason || 'Waiting for the auctioneer to open bidding.'}
      </p>

      <div className="figs" style={{ marginTop: 16 }}>
        <div className="fig"><div className="k">Purse left</div><div className="v serif money">{cr(myTeam.purse)}</div></div>
        <div className="fig">
          <div className="k">Squad</div>
          <div className="v">{myTeam.squadSize}<span className="muted" style={{ fontSize: 15 }}> / {myTeam.maxSquad}</span></div>
          <div className="s">{myTeam.needForMin ? `${myTeam.needForMin} more to reach ${myTeam.minSquad}` : `minimum of ${myTeam.minSquad} met`}</div>
        </div>
        {snapshot.settings.showMaxBidToOwners ? (
          <div className="fig">
            <div className="k">Most you may bid</div>
            <div className="v serif money">{cr(myTeam.maxAllowedBid)}</div>
            <div className="s">holding back for a full squad</div>
          </div>
        ) : null}
        <div className="fig"><div className="k">Spent</div><div className="v money">{cr(myTeam.spent)}</div></div>
      </div>

      {myTeam.squad.length ? (
        <>
          <hr className="sep" />
          <div className="eyebrow">Bought so far ({myTeam.squad.length})</div>
          <div className="chips" style={{ marginTop: 10 }}>
            {myTeam.squad.map((p) => (
              <span key={p.id} className="chip" style={{ cursor: 'default' }}>
                {p.isCaptain ? 'Captain · ' : ''}{p.name} <b className="money" style={{ marginLeft: 4 }}>{cr(p.soldPrice)}</b>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
