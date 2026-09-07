import React, { useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Modal } from './ui.jsx';

/**
 * Shared add/edit/delete modals, so the auctioneer can manage teams and
 * players from the page they are already on — not only from Admin.
 */

export function TeamEditor({ team, onClose }) {
  const { action } = useAuction();
  const adding = !team;
  const [f, setF] = useState(adding
    ? { name: '', owner: '', color: '#d9ab4b', startingPurse: '' }
    : { name: team.name, owner: team.owner, color: team.color, startingPurse: team.startingPurse, status: team.status });

  const save = async () => {
    const r = adding
      ? await action('ADD_TEAM', { fields: { name: f.name, owner: f.owner, color: f.color, ...(f.startingPurse !== '' ? { startingPurse: f.startingPurse } : {}) } })
      : await action('EDIT_TEAM', { teamId: team.id, fields: f });
    if (r.ok) onClose();
  };

  return (
    <Modal title={adding ? 'Add a team' : team.name} onClose={onClose}>
      <div className="form-grid">
        <label className="field">Team name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={adding} /></label>
        <label className="field">Owner<input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></label>
        <label className="field">Colour<input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
        <label className="field">Opening purse (Cr){adding ? ' — blank uses the default' : ''}
          <input type="number" min="1" value={f.startingPurse} onChange={(e) => setF({ ...f, startingPurse: e.target.value })} />
        </label>
        {!adding ? (
          <label className="field">Status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        ) : null}
      </div>

      {!adding ? (
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          The team's password appears in Admin → Owner logins the moment it exists.
          Purse left right now: <b className="money">{cr(team.purse)}</b>.
        </p>
      ) : null}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary" disabled={!f.name} onClick={save}>{adding ? 'Add team' : 'Save team'}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <span className="spacer" />
        {!adding ? (
          <button className="btn sm danger" disabled={team.squadSize > 0}
            title={team.squadSize > 0 ? 'Release its players first' : ''}
            onClick={async () => {
              if (confirm(`Delete ${team.name}? This cannot be picked back up from Unsold.`)) {
                const r = await action('DELETE_TEAM', { teamId: team.id });
                if (r.ok) onClose();
              }
            }}>Delete team</button>
        ) : null}
      </div>
    </Modal>
  );
}

export function PlayerEditor({ player, onClose }) {
  const { snapshot, action } = useAuction();
  const adding = !player;
  const ROLES = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];
  const firstCat = (snapshot.categories[0] || {}).name || 'A';
  const [f, setF] = useState(adding
    ? { name: '', primaryCategory: firstCat, role: 'Batsman', basePrice: (snapshot.categories[0] || {}).basePrice || '' }
    : { name: player.name, primaryCategory: player.primaryCategory, role: player.role, basePrice: player.basePrice, sequence: player.sequence, notes: player.notes });

  const sold = !adding && player.status === 'SOLD';
  const onBlock = !adding && player.status === 'IN_AUCTION';

  const save = async () => {
    const fields = { ...f };
    if (sold) delete fields.basePrice;
    const r = adding
      ? await action('ADD_PLAYER', { fields })
      : await action('EDIT_PLAYER', { playerId: player.id, fields });
    if (r.ok) onClose();
  };

  return (
    <Modal title={adding ? 'Add a player' : player.name} onClose={onClose}>
      <div className="form-grid">
        <label className="field">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={adding} /></label>
        <label className="field">Category
          <select value={f.primaryCategory} onChange={(e) => {
            const cat = snapshot.categories.find((c) => c.name === e.target.value);
            setF((prev) => ({ ...prev, primaryCategory: e.target.value, basePrice: sold || !cat ? prev.basePrice : cat.basePrice }));
          }}>
            {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name} — {cr(c.basePrice)}</option>)}
          </select>
        </label>
        <label className="field">Role
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">Base price (Cr)
          <input type="number" min="0" value={f.basePrice} disabled={sold}
            onChange={(e) => setF({ ...f, basePrice: e.target.value })} />
        </label>
        {!adding ? (
          <label className="field">Lot number
            <input type="number" value={f.sequence} onChange={(e) => setF({ ...f, sequence: e.target.value })} />
          </label>
        ) : null}
      </div>
      {!adding ? (
        <label className="field" style={{ marginTop: 14 }}>Notes
          <textarea rows="2" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
      ) : null}
      {sold ? <p className="small muted" style={{ margin: '12px 0 0' }}>Sold lots keep their base and hammer price — use Admin → corrections to change the result.</p> : null}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary" disabled={!f.name} onClick={save}>{adding ? 'Add player' : 'Save player'}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <span className="spacer" />
        {!adding ? (
          <>
            <button className="btn sm" disabled={sold || onBlock || player.status === 'REMOVED'}
              title="Keeps the player, marked as withdrawn — restorable from the Unsold page"
              onClick={async () => {
                if (confirm(`Withdraw ${player.name} from this sale?`)) {
                  const r = await action('REMOVE_PLAYER', { playerId: player.id });
                  if (r.ok) onClose();
                }
              }}>Withdraw</button>
            <button className="btn sm danger" disabled={sold || onBlock}
              title={sold ? 'Release them from the team first' : onBlock ? 'Settle the current lot first' : 'Removes the player completely'}
              onClick={async () => {
                if (confirm(`Delete ${player.name} completely? Undo can bring them back during this session.`)) {
                  const r = await action('DELETE_PLAYER', { playerId: player.id });
                  if (r.ok) onClose();
                }
              }}>Delete</button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
