import React, { useEffect, useMemo, useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { Avatar, TeamCrest, IconClock, RoleIcon, SkillBars, timeAgo } from './graphics.jsx';

export function Cat({ value }) {
  if (!value) return null;
  return <span className="cat" data-c={value}>{value}</span>;
}

export function StatusTag({ status }) {
  const map = { AVAILABLE: '', IN_AUCTION: 'warn', SOLD: 'good', UNSOLD: 'bad', REMOVED: '' };
  const label = { AVAILABLE: 'In catalogue', IN_AUCTION: 'On the block', SOLD: 'Sold', UNSOLD: 'Unsold', REMOVED: 'Withdrawn' };
  return <span className={`tag ${map[status] || ''}`}>{label[status] || status}</span>;
}
export const StatusPill = StatusTag;

export function Fig({ k, v, sub, serif }) {
  return (
    <div className="fig">
      <div className="k">{k}</div>
      <div className={`v ${serif ? 'serif' : ''}`}>{v}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}
export const Stat = Fig;

/** Big page masthead — so every page announces itself at a glance. */
export function PageHead({ title, sub, aside }) {
  return (
    <div className="pagehead">
      <div>
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {aside ? <div className="row tight">{aside}</div> : null}
    </div>
  );
}

export function Card({ title, aside, children, flush }) {
  return (
    <section className="card">
      {(title || aside) ? (
        <header className="card-head">
          <span className="eyebrow">{title}</span>
          {aside}
        </header>
      ) : null}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(1040px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useAuction();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.title ? <b>{t.title}</b> : null}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Click-a-team-name popup: squad, purse, ceiling — without leaving the room. */
export function TeamPeek({ team, onClose }) {
  const { snapshot, isAdmin } = useAuction();
  if (!team) return null;
  const showPurse = snapshot.settings.showTeamPursePublicly || isAdmin;
  return (
    <Modal
      title={team.name}
      onClose={onClose}
    >
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="row tight">
          <span className="dot" style={{ background: team.color }} />
          <span className="lot-no">{team.owner || 'no owner'}</span>
        </span>
        {team.captainName ? <span className="tag warn">Captain · {team.captainName}</span> : <span className="tag">No captain</span>}
      </div>

      <div className="figs">
        <Fig k="Purse left" v={showPurse ? cr(team.purse) : '••••'} serif />
        <Fig k="Spent" v={cr(team.spent)} serif />
        <Fig k="Max bid" v={showPurse ? cr(team.maxAllowedBid) : '••••'} serif />
        <Fig k="Squad" v={`${team.squadSize} / ${team.maxSquad}`}
          sub={team.needForMin ? `${team.needForMin} more to reach ${team.minSquad}` : `minimum of ${team.minSquad} met`} />
      </div>

      {team.squad.length ? (
        <div style={{ marginTop: 16, border: '1px solid var(--rule)', borderRadius: 'var(--r-ctl)', overflow: 'hidden' }}>
          <table className="data">
            <tbody>
              {team.squad.map((p) => (
                <tr key={p.id}>
                  <td>{p.isCaptain ? '★ ' : ''}{p.name}</td>
                  <td style={{ width: 48 }}><Cat value={p.primaryCategory} /></td>
                  <td className="small muted">{p.role}</td>
                  <td className="num"><b className="money">{cr(p.soldPrice)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty" style={{ padding: 22 }}>Nothing bought yet.</div>}

      <div className="row" style={{ marginTop: 16 }}>
        <a className="btn sm ghost" href={`/teams/${team.id}`}>Open full team page</a>
      </div>
    </Modal>
  );
}


/** The player profile — jersey, banner, tiles, and their own bid history. */
export function PlayerPeek({ player, onClose }) {
  const { snapshot } = useAuction();
  if (!player) return null;
  const team = player.teamId ? snapshot.teams.find((t) => t.id === player.teamId) : null;
  const bids = snapshot.history
    .filter((h) => h.action === 'BID_PLACED' && h.playerId === player.id)
    .slice(0, 6);

  return (
    <Modal title="Player profile" onClose={onClose}>
      <div className="profile-head">
        <Avatar name={player.name} color={team ? team.color : '#6b7280'} size={92} />
        <div style={{ minWidth: 0 }}>
          <div className="name-banner static">{player.name}</div>
          <div className="row tight" style={{ marginTop: 9, flexWrap: 'wrap' }}>
            <Cat value={player.primaryCategory} />
            <span className="tag"><RoleIcon role={player.role} size={12} /> {player.role}</span>
            <span className="lot-no">Lot {String(player.sequence).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      {player.status === 'SOLD' && team ? (
        <div className="sold-ribbon">
          <TeamCrest name={team.name} color={team.color} size={26} />
          SOLD to {team.name} for <b className="money">{cr(player.soldPrice)}</b>
        </div>
      ) : null}

      <div className="spot-tiles" style={{ marginTop: 14 }}>
        <div className="tile"><span className="k">Base price</span><b className="money">{cr(player.basePrice)}</b></div>
        <div className="tile"><span className="k">Tier</span><b>{player.primaryCategory}</b></div>
        <div className="tile"><span className="k">Status</span><b>{player.status === 'SOLD' ? 'Sold' : player.status === 'UNSOLD' ? 'Unsold' : player.status === 'IN_AUCTION' ? 'On the block' : player.status === 'REMOVED' ? 'Withdrawn' : 'In catalogue'}</b></div>
        <div className="tile"><span className="k">Times offered</span><b>{player.timesAuctioned}</b></div>
      </div>

      <SkillBars player={player} />

      {player.notes ? <p className="small muted" style={{ margin: '12px 0 0' }}>{player.notes}</p> : null}

      {bids.length ? (
        <div className="bid-feed" style={{ marginTop: 14 }}>
          <div className="k"><IconClock /> Bid history for {player.name}</div>
          {bids.map((h) => {
            const t = snapshot.teams.find((x) => x.id === h.teamId);
            return (
              <div className="feed-row" key={h.id}>
                <TeamCrest name={t ? t.name : '?'} color={t ? t.color : '#5468FF'} size={24} />
                <div className="feed-main">
                  <span className="who">{t ? t.name : h.teamId} — raised to <b className="money">{cr(h.value)}</b></span>
                  <span className="when">{timeAgo(h.ts)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Modal>
  );
}

/** Sortable table. columns: [{key,label,num,render,sortValue,sortable}] */
export function DataTable({ columns, rows, empty = 'Nothing here yet', initialSort, rowKey = (r) => r.id, maxHeight }) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: 'asc' });

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r) => {
      const v = col.sortValue ? col.sortValue(r) : r[col.key];
      return v === null || v === undefined ? (col.num ? -Infinity : '') : v;
    };
    return [...rows].sort((a, b) => {
      const av = val(a); const bv = val(b);
      const c = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort, columns]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? 'num' : ''} ${c.sortable === false ? 'no-sort' : ''} ${c.hide ? 'hide-' + c.hide : ''}`}
                onClick={c.sortable === false ? undefined : () => toggle(c.key)}
                aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? 'num' : ''} ${c.mono ? 'id' : ''} ${c.hide ? 'hide-' + c.hide : ''}`}>
                  {c.render ? c.render(r) : (r[c.key] === null || r[c.key] === undefined || r[c.key] === '' ? '—' : r[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {!sorted.length ? (
            <tr><td colSpan={columns.length}><div className="empty">{empty}</div></td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Searchable catalogue chooser — the auctioneer picking the next lot. */
export function PlayerPicker({ players, onPick, statuses = ['AVAILABLE'], footer }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [role, setRole] = useState('');

  const cats = useMemo(() => [...new Set(players.map((p) => p.primaryCategory))].filter(Boolean), [players]);
  const roles = useMemo(() => [...new Set(players.map((p) => p.role))].filter(Boolean), [players]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => statuses.includes(p.status))
      .filter((p) => !cat || p.primaryCategory === cat)
      .filter((p) => !role || p.role === role)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle))
      .sort((a, b) => a.sequence - b.sequence);
  }, [players, q, cat, role, statuses]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search by name or ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} autoFocus />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="lot-no">{list.length} lots</span>
      </div>
      <DataTable
        maxHeight="46vh"
        columns={[
          { key: 'sequence', label: 'Lot', num: true, mono: true, hide: 'sm' },
          { key: 'name', label: 'Player', render: (p) => <b style={{ fontWeight: 600 }}>{p.name}</b> },
          { key: 'primaryCategory', label: 'Category', render: (p) => <span className="row tight"><Cat value={p.primaryCategory} />{p.secondaryCategory ? <Cat value={p.secondaryCategory} /> : null}</span> },
          { key: 'role', label: 'Role', hide: 'sm' },
          { key: 'basePrice', label: 'Base price', num: true, render: (p) => <span className="money">{cr(p.basePrice)}</span> },
          { key: 'status', label: 'Status', hide: 'sm', render: (p) => <StatusTag status={p.status} /> },
          { key: 'pick', label: '', sortable: false, render: (p) => <button className="btn sm primary" onClick={() => onPick(p)}>Put on the block</button> },
        ]}
        rows={list}
        initialSort={{ key: 'sequence', dir: 'asc' }}
        empty="No lots match those filters"
      />
      {footer}
    </div>
  );
}
