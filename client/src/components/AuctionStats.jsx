import React from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Card, Fig } from './ui.jsx';

export default function AuctionStats({ full }) {
  const { snapshot } = useAuction();
  const s = snapshot.stats;

  return (
    <Card title="The sale so far">
      <div className="figs">
        <Fig k="Lots" v={s.totalPlayers} />
        <Fig k="Sold" v={s.sold} />
        <Fig k="Unsold" v={s.unsold} />
        <Fig k="Still to come" v={s.available} />
        <Fig k="Total realised" v={cr(s.totalSpent)} serif />
        <Fig k="Top price" v={s.highestPurchase ? cr(s.highestPurchase.price) : '—'} serif
          sub={s.highestPurchase ? `${s.highestPurchase.player} to ${s.highestPurchase.team}` : 'nothing sold yet'} />
        {full ? <Fig k="Average price" v={cr(s.averageSoldPrice)} serif /> : null}
        {full ? <Fig k="Purse still in play" v={cr(s.totalPurseRemaining)} serif /> : null}
      </div>

      {full ? (
        <>
          <hr className="sep" />
          <div className="eyebrow">Top price by category</div>
          <div className="figs" style={{ marginTop: 10 }}>
            {Object.entries(s.highestByCategory).map(([cat, best]) => (
              <Fig key={cat} k={cat} v={best ? cr(best.price) : '—'} serif
                sub={best ? `${best.player} to ${best.team}` : 'none sold'} />
            ))}
          </div>

          <hr className="sep" />
          <div className="eyebrow">Purses</div>
          <div className="figs" style={{ marginTop: 10 }}>
            <Fig k="Biggest spender" v={s.mostExpensiveTeam ? cr(s.mostExpensiveTeam.spent) : '—'} serif
              sub={s.mostExpensiveTeam ? s.mostExpensiveTeam.name : ''} />
            <Fig k="Deepest pocket" v={s.largestPurseTeam ? cr(s.largestPurseTeam.purse) : '—'} serif
              sub={s.largestPurseTeam ? s.largestPurseTeam.name : ''} />
            <Fig k="Thinnest purse" v={s.smallestPurseTeam ? cr(s.smallestPurseTeam.purse) : '—'} serif
              sub={s.smallestPurseTeam ? s.smallestPurseTeam.name : ''} />
          </div>
        </>
      ) : null}
    </Card>
  );
}
