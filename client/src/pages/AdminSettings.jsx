import React, { useEffect, useMemo, useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';

import { DataTable, Modal, PlayerPicker, Card, PageHead } from '../components/ui.jsx';

/* ------------------------------------------------------------ corrections */

function CorrectionPanel() {
  const { snapshot, action } = useAuction();
  const sold = useMemo(() => snapshot.players.filter((p) => p.status === 'SOLD'), [snapshot.players]);
  const [playerId, setPlayerId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [price, setPrice] = useState('');

  const player = sold.find((p) => p.id === playerId);
  useEffect(() => {
    if (player) { setTeamId(player.teamId); setPrice(String(player.soldPrice)); }
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = snapshot.teams.find((t) => t.id === teamId);
  const changed = player && (teamId !== player.teamId || Number(price) !== player.soldPrice);

  return (
    <Card
      title="Put a result right"
      aside={
        <button className="btn sm ghost" disabled={!snapshot.undo.canUndo}
          title={snapshot.undo.label} onClick={() => action('UNDO')}>
          Undo last action
        </button>
      }
    >
      <div className="row">
        <label className="field" style={{ flex: 1, minWidth: 220 }}>Sold lot
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">Choose a sold lot</option>
            {sold.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.teamName} — {p.soldPrice} Cr</option>)}
          </select>
        </label>
        <label className="field">Belongs to
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!player}>
            {snapshot.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.squadSize}/{t.maxSquad}, {t.purse} Cr left)</option>)}
          </select>
        </label>
        <label className="field">Hammer price
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!player} style={{ width: 110 }} />
        </label>
      </div>

      <p className="small muted" style={{ margin: '12px 0 0' }}>
        {!player
          ? 'Pick a sold lot to move it between teams or change what was paid.'
          : changed && target
            ? `Applying this refunds ${cr(player.soldPrice)} to ${player.teamName} and takes ${cr(Number(price))} from ${target.name} — in one step, both purses and squads together.`
            : `${player.name} is with ${player.teamName} at ${cr(player.soldPrice)}. Change the team or the price to enable the correction.`}
      </p>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!player || !changed}
          onClick={async () => {
            const r = await action('CORRECT_ALLOCATION', { playerId, teamId, soldPrice: Number(price) });
            if (r.ok) setPlayerId('');
          }}>Apply correction</button>
        <button className="btn danger" disabled={!player}
          onClick={() => {
            if (confirm(`Release ${player.name} from ${player.teamName} and refund ${cr(player.soldPrice)}?`)) {
              action('REMOVE_FROM_TEAM', { playerId }).then((r) => { if (r.ok) setPlayerId(''); });
            }
          }}>Release and refund</button>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- captains */

function CaptainPanel() {
  const { snapshot, action } = useAuction();
  return (
    <Card title="Captains">
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))' }}>
        {snapshot.teams.map((t) => (
          <div key={t.id} className="row between" style={{ background: 'var(--fill)', padding: '11px 13px', borderRadius: 'var(--r-ctl)' }}>
            <div>
              <div className="row tight" style={{ fontWeight: 600 }}>
                <span className="dot" style={{ background: t.color }} />{t.name}
              </div>
              <div className="team-owner">{t.captainName || 'none named'}</div>
            </div>
            <select value={t.captainId} onChange={(e) => action('ASSIGN_CAPTAIN', { teamId: t.id, playerId: e.target.value })}
              disabled={!t.squad.length} aria-label={`${t.name} captain`}>
              <option value="">No captain</option>
              {t.squad.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        A captain must already be in that team's squad. One per team, changeable at any time.
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------- settings */

function SettingsForm() {
  const { snapshot, action } = useAuction();
  const [form, setForm] = useState(snapshot.settings);
  useEffect(() => setForm(snapshot.settings), [snapshot.settings]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const TOGGLES = [
    ['allowUnsoldRound', 'Allow re-offering unsold lots'],
    ['enableRandomPlayer', 'Let the auctioneer draw at random'],
    ['enableRandomCategory', 'Allow drawing by category'],
    ['autoBackup', 'Back up after every sale'],
    ['showTeamPursePublicly', 'Show purses to everyone'],
    ['showMaxBidToOwners', 'Show owners their bidding ceiling'],
    ['showAuctionHistory', 'Show the ledger'],
    ['enableProjectorMode', 'Enable the big screen'],
  ];

  return (
    <Card title="Sale conditions">
      <div className="form-grid">
        <label className="field">Sale name
          <input value={form.auctionName} onChange={(e) => set('auctionName', e.target.value)} />
        </label>
        <label className="field">Opening purse (Cr)
          <input type="number" min="1" value={form.startingPurse} onChange={(e) => set('startingPurse', e.target.value)} />
        </label>
        <label className="field">Minimum squad
          <input type="number" min="1" value={form.minSquad} onChange={(e) => set('minSquad', e.target.value)} />
        </label>
        <label className="field">Maximum squad
          <input type="number" min="1" value={form.maxSquad} onChange={(e) => set('maxSquad', e.target.value)} />
        </label>
        <label className="field">Bid step (Cr)
          <input type="number" min="0.25" step="0.25" value={form.bidIncrement} onChange={(e) => set('bidIncrement', e.target.value)} />
        </label>
        <label className="field">Reserve formula
          <select value={form.reserveMode} onChange={(e) => set('reserveMode', e.target.value)}>
            <option value="corrected">Corrected — hold back for the rest</option>
            <option value="spec">Literal spec — holds back one extra</option>
          </select>
        </label>
      </div>

      <p className="small muted" style={{ margin: '14px 0 0' }}>
        <b>Corrected</b> sets a team's ceiling at <span className="money">purse − (minimum − squad − 1) × cheapest lot</span>,
        so a team on {Math.max(0, Number(form.minSquad) - 1)} players with {cr(1)} left can still buy its last one.
        The literal version drops the −1 and would leave that team unable to bid at all.
      </p>

      <hr className="sep" />
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {TOGGLES.map(([k, label]) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} />{label}
          </label>
        ))}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn primary" onClick={() => action('UPDATE_SETTINGS', { patch: form })}>Save conditions</button>
        <button className="btn ghost" onClick={() => setForm(snapshot.settings)}>Discard changes</button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- categories */

function CategoriesForm() {
  const { snapshot, action } = useAuction();
  const [cats, setCats] = useState(snapshot.categories);
  useEffect(() => setCats(snapshot.categories), [snapshot.categories]);

  return (
    <Card title="Categories & base prices">
      <div className="stack" style={{ gap: 9 }}>
        {cats.map((c, i) => (
          <div className="row tight" key={i}>
            <input value={c.name} style={{ width: 84 }} aria-label="Category name"
              onChange={(e) => setCats((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input type="number" min="0.5" step="0.5" value={c.basePrice} style={{ width: 96 }} aria-label="Base price"
              onChange={(e) => setCats((l) => l.map((x, j) => (j === i ? { ...x, basePrice: e.target.value } : x)))} />
            <span className="small muted">Cr</span>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => setCats((l) => l.filter((_, j) => j !== i))} aria-label="Remove">Remove</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn sm" onClick={() => setCats((l) => [...l, { name: '', basePrice: 1 }])}>Add a category</button>
        <button className="btn primary" onClick={() => action('UPDATE_CATEGORIES', { categories: cats })}>Save categories</button>
      </div>
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        Saving refreshes the base price of every unsold lot still on its category default. Sold lots keep what they fetched.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ teams */

function TeamsAdmin() {
  const { snapshot, action } = useAuction();
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', owner: '', color: '#14532d' });

  return (
    <Card title="Teams & purses" aside={<button className="btn sm" onClick={() => setAdding(true)}>Add a team</button>} flush>
      <DataTable
        rows={snapshot.teams}
        initialSort={{ key: 'name', dir: 'asc' }}
        columns={[
          {
            key: 'name', label: 'Team',
            render: (t) => <span className="row tight"><span className="dot" style={{ background: t.color }} /><b style={{ fontWeight: 600 }}>{t.name}</b></span>,
          },
          { key: 'owner', label: 'Owner' },
          { key: 'purse', label: 'Purse left', num: true, render: (t) => <b className="money">{cr(t.purse)}</b> },
          { key: 'spent', label: 'Spent', num: true, render: (t) => <span className="money">{cr(t.spent)}</span> },
          { key: 'squadSize', label: 'Squad', num: true, render: (t) => `${t.squadSize}/${t.maxSquad}` },
          { key: 'captainName', label: 'Captain', render: (t) => t.captainName || '—' },
          { key: 'status', label: 'Status', render: (t) => <span className={`tag ${t.status === 'ACTIVE' ? 'good' : 'bad'}`}>{t.status.toLowerCase()}</span> },
          {
            key: 'act', label: '', sortable: false,
            render: (t) => (
              <div className="row tight">
                <button className="btn sm" onClick={() => setEdit({ ...t })}>Edit</button>
                <button className="btn sm" onClick={() => {
                  const v = prompt(`Set ${t.name}'s remaining purse in Cr. Currently ${t.purse}.`, t.purse);
                  if (v !== null) action('ADJUST_PURSE', { teamId: t.id, purse: Number(v) });
                }}>Adjust purse</button>
                <button className="btn sm danger" disabled={t.squadSize > 0}
                  title={t.squadSize > 0 ? 'Release its players first' : ''}
                  onClick={() => { if (confirm(`Delete ${t.name}?`)) action('DELETE_TEAM', { teamId: t.id }); }}>Delete</button>
              </div>
            ),
          },
        ]}
      />

      {edit ? (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <label className="field">Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">Owner<input value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} /></label>
            <label className="field">Colour<input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></label>
            <label className="field">Opening purse<input type="number" value={edit.startingPurse} onChange={(e) => setEdit({ ...edit, startingPurse: e.target.value })} /></label>
            <label className="field">Status
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={async () => {
              const r = await action('EDIT_TEAM', {
                teamId: edit.id,
                fields: { name: edit.name, owner: edit.owner, color: edit.color, startingPurse: edit.startingPurse, status: edit.status },
              });
              if (r.ok) setEdit(null);
            }}>Save team</button>
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </Modal>
      ) : null}

      {adding ? (
        <Modal title="Add a team" onClose={() => setAdding(false)}>
          <div className="form-grid">
            <label className="field">Team name<input value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} autoFocus /></label>
            <label className="field">Owner<input value={newTeam.owner} onChange={(e) => setNewTeam({ ...newTeam, owner: e.target.value })} /></label>
            <label className="field">Colour<input type="color" value={newTeam.color} onChange={(e) => setNewTeam({ ...newTeam, color: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" disabled={!newTeam.name} onClick={async () => {
              const r = await action('ADD_TEAM', { fields: newTeam });
              if (r.ok) { setAdding(false); setNewTeam({ name: '', owner: '', color: '#14532d' }); }
            }}>Add team</button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- players */

function PlayersAdmin() {
  const { snapshot, action } = useAuction();
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ name: '', primaryCategory: 'A', secondaryCategory: '', role: 'Batsman', basePrice: '' });
  const [picking, setPicking] = useState(false);
  const ROLES = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];

  return (
    <Card
      title="The catalogue"
      aside={
        <span className="row tight">
          <button className="btn sm" onClick={() => setPicking(true)}>Edit a lot</button>
          <button className="btn sm" onClick={() => setAdding(true)}>Add a lot</button>
        </span>
      }
    >
      <p className="small muted" style={{ margin: 0 }}>
        Base prices can only change while a lot is unsold. Editing a category never repriced anything already sold.
      </p>

      {picking ? (
        <Modal title="Which lot?" wide onClose={() => setPicking(false)}>
          <PlayerPicker players={snapshot.players} statuses={['AVAILABLE', 'UNSOLD', 'SOLD', 'REMOVED', 'IN_AUCTION']}
            onPick={(p) => { setPicking(false); setEdit({ ...p }); }} />
        </Modal>
      ) : null}

      {edit ? (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <label className="field">Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">Category
              <select value={edit.primaryCategory} onChange={(e) => {
                const cat = snapshot.categories.find((c) => c.name === e.target.value);
                setEdit((prev) => ({
                  ...prev,
                  primaryCategory: e.target.value,
                  basePrice: prev.status === 'SOLD' || !cat ? prev.basePrice : cat.basePrice,
                }));
              }}>
                {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name} — {cr(c.basePrice)}</option>)}
              </select>
            </label>
            <label className="field">Second category
              <select value={edit.secondaryCategory} onChange={(e) => setEdit({ ...edit, secondaryCategory: e.target.value })}>
                <option value="">None</option>
                {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">Role
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">Base price (Cr)
              <input type="number" min="0" value={edit.basePrice} disabled={edit.status === 'SOLD'}
                onChange={(e) => setEdit({ ...edit, basePrice: e.target.value })} />
            </label>
            <label className="field">Lot number
              <input type="number" value={edit.sequence} onChange={(e) => setEdit({ ...edit, sequence: e.target.value })} />
            </label>
          </div>
          <label className="field" style={{ marginTop: 14 }}>Notes
            <textarea rows="2" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </label>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={async () => {
              const fields = {
                name: edit.name, primaryCategory: edit.primaryCategory, secondaryCategory: edit.secondaryCategory,
                role: edit.role, sequence: edit.sequence, notes: edit.notes,
              };
              if (edit.status !== 'SOLD') fields.basePrice = edit.basePrice;
              const r = await action('EDIT_PLAYER', { playerId: edit.id, fields });
              if (r.ok) setEdit(null);
            }}>Save lot</button>
            <span className="spacer" />
            <button className="btn danger" onClick={() => {
              if (confirm(`Withdraw ${edit.name} from this sale entirely?`)) {
                action('REMOVE_PLAYER', { playerId: edit.id }).then((r) => { if (r.ok) setEdit(null); });
              }
            }}>Withdraw lot</button>
          </div>
        </Modal>
      ) : null}

      {adding ? (
        <Modal title="Add a lot" onClose={() => setAdding(false)}>
          <div className="form-grid">
            <label className="field">Name<input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} autoFocus /></label>
            <label className="field">Category
              <select value={np.primaryCategory} onChange={(e) => setNp({ ...np, primaryCategory: e.target.value })}>
                {snapshot.categories.map((c) => <option key={c.name} value={c.name}>{c.name} — {cr(c.basePrice)}</option>)}
              </select>
            </label>
            <label className="field">Role
              <select value={np.role} onChange={(e) => setNp({ ...np, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">Base price — blank uses the category
              <input type="number" min="0" value={np.basePrice} onChange={(e) => setNp({ ...np, basePrice: e.target.value })} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" disabled={!np.name} onClick={async () => {
              const fields = { ...np };
              if (fields.basePrice === '') delete fields.basePrice;
              const r = await action('ADD_PLAYER', { fields });
              if (r.ok) { setAdding(false); setNp({ name: '', primaryCategory: 'B', secondaryCategory: '', role: 'Batsman', basePrice: '' }); }
            }}>Add lot</button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------ owner logins */

function OwnerLogins() {
  const { authKey, snapshot } = useAuction();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const load = () => {
    setErr('');
    fetch('/api/passwords', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: authKey }),
    }).then((r) => r.json())
      .then((d) => (d.ok ? setData(d) : setErr(d.error || 'Could not load the passwords.')))
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { if (open) load(); }, [open, snapshot.teams.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card
      title="Owner logins"
      aside={<button className="btn sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide passwords' : 'Show passwords'}</button>}
    >
      {!open ? (
        <p className="small muted" style={{ margin: 0 }}>
          Every team's password, ready to hand out — a team added above gets its password here instantly.
        </p>
      ) : err ? (
        <p className="small" style={{ margin: 0, color: 'var(--oxblood)', fontWeight: 600 }}>{err}</p>
      ) : !data ? (
        <p className="small muted" style={{ margin: 0 }}>Loading…</p>
      ) : (
        <>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-ctl)', overflow: 'hidden' }}>
            <table className="data">
              <tbody>
                <tr>
                  <td><b style={{ fontWeight: 600 }}>Auctioneer (you)</b></td>
                  <td className="small muted">keep this one to yourself</td>
                  <td className="num"><b className="money" style={{ fontFamily: 'var(--mono)' }}>{data.admin}</b></td>
                </tr>
                {data.teams.map((t) => (
                  <tr key={t.id}>
                    <td><b style={{ fontWeight: 600 }}>{t.name}</b></td>
                    <td className="small muted">{t.owner || '—'}</td>
                    <td className="num"><b style={{ fontFamily: 'var(--mono)' }}>{t.password || '(restart to generate)'}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            DM each owner their own line. Resetting the sale keeps these; deleting <span style={{ fontFamily: 'var(--mono)' }}>data/auth.json</span> and restarting regenerates them.
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- backups */

function BackupsPanel() {
  const { action } = useAuction();
  const [backups, setBackups] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => fetch('/api/backups').then((r) => r.json()).then((d) => setBackups(d.backups || []));
  useEffect(() => { if (open) load(); }, [open]);

  const EXPORTS = [
    ['auction', 'auction.csv', 'single file, record_type schema'],
    ['players', 'players.csv', 'the whole catalogue'],
    ['teams', 'teams.csv', 'purses and squads'],
    ['sold', 'sold-players.csv', 'results'],
    ['transactions', 'transactions.csv', 'the full ledger'],
  ];

  return (
    <Card
      title="Records"
      aside={<button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide backups' : 'Show backups'}</button>}
    >
      <div className="row">
        <button className="btn" onClick={() => action('CREATE_BACKUP', { label: 'manual' }).then(load)}>Back up now</button>
        {EXPORTS.map(([kind, file, hint]) => (
          <a key={kind} className="btn sm ghost" href={`/api/export/${kind}`} download title={hint}>{file}</a>
        ))}
      </div>

      {open ? (
        <div style={{ marginTop: 16 }}>
          <DataTable
            rows={backups.map((b) => ({ ...b, id: b.file }))}
            initialSort={{ key: 'file', dir: 'desc' }}
            empty="No backups yet."
            columns={[
              { key: 'file', label: 'File', mono: true },
              { key: 'size', label: 'Bytes', num: true },
              { key: 'createdAt', label: 'Written', render: (b) => new Date(b.createdAt).toLocaleString() },
            ]}
          />
        </div>
      ) : null}

      <hr className="sep" />
      <div className="row between">
        <p className="small muted" style={{ margin: 0, maxWidth: 460 }}>
          Resetting clears every sale, purse and ledger entry and rebuilds the 64-lot catalogue.
          A backup is written first, so this can be recovered from disk.
        </p>
        <button className="btn danger" onClick={() => {
          if (confirm('Clear every result and rebuild the catalogue from scratch?')) {
            action('RESET_AUCTION', { confirm: 'RESET' });
          }
        }}>Reset the sale</button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------- page */

export default function AdminSettings() {
  const { isAdmin } = useAuction();
  if (!isAdmin) {
    return (
      <section className="card"><div className="card-body">
        <div className="empty">Switch your role to Auctioneer in the top bar to reach these controls.</div>
      </div></section>
    );
  }
  return (
    <div className="stack">
      <PageHead
        title="Admin"
        sub="Fix results, name captains, tune the rules, manage teams, players and backups."
      />
      <CorrectionPanel />
      <CaptainPanel />
      <div className="stack" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', display: 'grid' }}>
        <SettingsForm />
        <CategoriesForm />
      </div>
      <TeamsAdmin />
      <OwnerLogins />
      <PlayersAdmin />
      <BackupsPanel />
    </div>
  );
}
