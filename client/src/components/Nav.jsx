import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuction } from '../lib/auction.jsx';

const LINKS = [
  ['/', 'Saleroom'],
  ['/players', 'Players'],
  ['/teams', 'Teams'],
  ['/squads', 'Squads'],
  ['/sold', 'Sold'],
  ['/unsold', 'Unsold'],
  ['/history', 'History'],
  ['/admin', 'Admin', 'adminOnly'],
  ['/display', 'Big screen'],
];

export default function Nav() {
  const { connected, role, setRole, snapshot, authKey, logout, myTeam } = useAuction();

  // Identity comes from the password now — no switchers, just a badge.
  const links = LINKS.filter(([, , flag]) => !(flag === 'adminOnly' && role !== 'admin'));
  const badge = role === 'admin' ? 'Auctioneer'
    : role === 'owner' ? (myTeam ? myTeam.name : 'Team owner')
      : role === 'spectator' ? 'Viewer' : '';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">The Saleroom</span>
        <span className="sub">{snapshot ? snapshot.settings.auctionName : 'Player auction'}</span>
      </div>

      <nav className="nav">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="row tight">
        {badge ? <span className="tag solid">{badge}</span> : null}
        {authKey ? (
          <button className="btn sm ghost" onClick={logout}>Log out</button>
        ) : role === 'spectator' ? (
          <button className="btn sm ghost" onClick={() => setRole('')}>Log in</button>
        ) : null}
        <span className={`conn ${connected ? '' : 'off'}`}>
          <i />{connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>
    </header>
  );
}
