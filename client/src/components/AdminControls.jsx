import React, { useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Modal, PlayerPicker } from './ui.jsx';

/**
 * The auctioneer's bench, kept to one line:
 *   Draw next lot -> Open bidding -> SOLD / UNSOLD
 * Everything rarer lives under "More".
 */
export default function AdminControls() {
  const { snapshot, action } = useAuction();
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const st = snapshot.state;
  const s = snapshot.settings;

  const paused = st.status === 'PAUSED';
  const idle = ['WAITING', 'SOLD', 'UNSOLD'].includes(st.status);
  const canSelect = st.started && idle;
  const canOpen = st.status === 'PLAYER_SELECTED';
  const canHammer = st.status === 'BIDDING' && !!st.highestBidderTeamId;
  const canPass = ['PLAYER_SELECTED', 'BIDDING'].includes(st.status);

  // The sale has not opened yet: one button, nothing else to think about.
  if (!st.started || st.status === 'COMPLETED') {
    return (
      <section className="card">
        <div className="card-body">
          <div className="row">
            <button className="btn hammer" onClick={() => action('START_AUCTION')}>Open the sale</button>
            <span className="small muted">
              {st.status === 'COMPLETED' ? 'The last sale has closed — this starts a new round of bidding.' : 'Everything else unlocks once the sale is open.'}
            </span>
          </div>
        </div>
      </section>
    );
  }

  const hint = paused
    ? 'Paused — resume to continue.'
    : canOpen
      ? `${snapshot.currentPlayer.name} is on the block — open bidding when ready.`
      : st.status === 'BIDDING' && !st.highestBidderTeamId
        ? 'Bidding is open. No bids yet — wait for a paddle or mark it unsold.'
        : canHammer
          ? `Hammer falls: ${snapshot.currentPlayer.name} to ${st.highestBidderName} for ${cr(st.currentBid)}.`
          : 'Pick the next lot.';

  return (
    <section className="card">
      <div className="card-head">
        <span className="eyebrow">Auctioneer</span>
        <span className="row tight">
          {paused
            ? <button className="btn sm primary" onClick={() => action('RESUME_AUCTION')}>Resume</button>
            : <button className="btn sm ghost" onClick={() => action('PAUSE_AUCTION')}>Pause</button>}
          <button className="btn sm ghost" disabled={!snapshot.undo.canUndo}
            title={snapshot.undo.label || 'Nothing to undo'} onClick={() => action('UNDO')}>
            Undo
          </button>
          <button className="btn sm ghost" onClick={() => setMore((m) => !m)}>{more ? 'Less' : 'More'}</button>
        </span>
      </div>

      <div className="card-body">
        <div className="actionbar">
          <button className="btn" disabled={!canSelect} onClick={() => setPicking(true)}>
            Next lot…
          </button>
          {s.enableRandomPlayer ? (
            <button className="btn" disabled={!canSelect} onClick={() => action('RANDOM_PLAYER', {})}>
              Draw at random
            </button>
          ) : null}
          <button className="btn primary" disabled={!canOpen} onClick={() => action('START_BIDDING')}>
            Open bidding
          </button>
          <span className="spacer" />
          <button className="btn hammer" disabled={!canHammer} onClick={() => action('MARK_SOLD')}>
            Sold{canHammer ? ` · ${cr(st.currentBid)}` : ''}
          </button>
          <button className="btn pass" disabled={!canPass} onClick={() => action('MARK_UNSOLD')}>Unsold</button>
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>{hint}</p>

        {more ? (
          <>
            <hr className="sep" />
            <div className="row">
              <button className="btn sm" disabled={!st.currentPlayerId} onClick={() => action('SKIP_PLAYER')}>
                Withdraw current lot
              </button>
              {snapshot.stats.unsold > 0 && s.allowUnsoldRound ? (
                <button className="btn sm" onClick={() => {
                  if (confirm(`Return all ${snapshot.stats.unsold} unsold lots to the catalogue and begin round ${st.round + 1}?`)) {
                    action('START_UNSOLD_ROUND');
                  }
                }}>Re-offer {snapshot.stats.unsold} unsold</button>
              ) : null}
              <button className="btn sm" onClick={() => action('CREATE_BACKUP', { label: 'manual' })}>Back up now</button>
              <a className="btn sm ghost" href="/api/export/auction" download>auction.csv</a>
              <a className="btn sm ghost" href="/api/export/sold" download>sold.csv</a>
              <span className="spacer" />
              <button className="btn sm danger"
                onClick={() => { if (confirm('Close the sale? No further bidding will be accepted.')) action('END_AUCTION'); }}>
                Close the sale
              </button>
              <button className="btn sm danger"
                onClick={() => {
                  const word = prompt('This wipes every sale, purse and ledger entry and rebuilds the full catalogue.\nA backup is written first.\n\nType RESET to confirm:');
                  if (word === null) return;
                  if (word.trim().toUpperCase() === 'RESET') action('RESET_AUCTION', { confirm: 'RESET' });
                  else alert('Not reset — you must type RESET exactly.');
                }}>
                Reset everything
              </button>
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>
              Corrections, captains, purses and player editing live in <a href="/admin" style={{ textDecoration: 'underline' }}>Admin</a>.
            </p>
          </>
        ) : null}
      </div>

      {picking ? (
        <Modal title="Next lot" wide onClose={() => setPicking(false)}>
          {s.enableRandomCategory ? (
            <div className="row" style={{ marginBottom: 14 }}>
              <span className="eyebrow">Draw at random from</span>
              {snapshot.categories.map((c) => (
                <button key={c.name} className="btn sm" onClick={async () => {
                  const r = await action('RANDOM_PLAYER', { category: c.name });
                  if (r.ok) setPicking(false);
                }}>{c.name} · {cr(c.basePrice)}</button>
              ))}
            </div>
          ) : null}
          <PlayerPicker
            players={snapshot.players}
            statuses={['AVAILABLE', 'UNSOLD']}
            onPick={(p) => {
              setPicking(false);
              if (p.status === 'UNSOLD') action('REAUCTION_PLAYER', { playerId: p.id });
              else action('SELECT_PLAYER', { playerId: p.id });
            }}
            footer={
              <p className="small muted" style={{ marginTop: 12 }}>
                Unsold lots go straight back on the block. The starting bid is the lot's base price.
              </p>
            }
          />
        </Modal>
      ) : null}
    </section>
  );
}
