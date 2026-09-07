import React, { useState } from 'react';
import { useAuction, cr } from '../lib/auction.jsx';
import { TeamPeek } from './ui.jsx';
import { TeamCrest, PurseBar, purseHealth } from './graphics.jsx';

export function TeamCard({ team, leading, mine, compact, onPeek }) {
  const { snapshot } = useAuction();
  const showPurse = snapshot.settings.showTeamPursePublicly;
  const pct = Math.min(100, Math.round((team.squadSize / team.maxSquad) * 100));

  return (
    <article
      className={`team clickable ${leading ? 'leading' : ''} ${mine ? 'mine' : ''}`}
      onClick={() => onPeek && onPeek(team)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onPeek) { e.preventDefault(); onPeek(team); } }}
      title={`See ${team.name}'s squad and balance`}
    >
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="team-name">
            <TeamCrest name={team.name} color={team.color} size={26} />
            {team.name}
          </div>
          <div className="team-owner">{team.owner || '—'}</div>
        </div>
        {leading ? <span className="tag warn">Leading</span> : null}
        {mine ? <span className="tag solid">You</span> : null}
        {team.status !== 'ACTIVE' ? <span className="tag bad">Inactive</span> : null}
      </div>

      <div className="team-figs">
        <div className="team-fig">
          <div className="k">Purse</div>
          <div className="v money">{showPurse ? cr(team.purse) : '••••'}</div>
        </div>
        <div className="team-fig">
          <div className="k">Squad</div>
          <div className="v">{team.squadSize} / {team.maxSquad}</div>
        </div>
        {!compact ? (
          <>
            <div className="team-fig">
              <div className="k">Max bid</div>
              <div className="v money">{showPurse ? cr(team.maxAllowedBid) : '••••'}</div>
            </div>
            <div className="team-fig">
              <div className="k">Spent</div>
              <div className="v money">{cr(team.spent)}</div>
            </div>
          </>
        ) : null}
      </div>

      <PurseBar purse={team.purse} startingPurse={team.startingPurse} />
      <div className="gauge-note">
        <span style={{ color: purseHealth(team.purse, team.startingPurse).color, fontWeight: 600 }}>
          {Math.round((team.purse / (team.startingPurse || 1)) * 100)}% purse left
        </span>
        <span>{team.squadSize}/{team.maxSquad} squad{team.captainName ? ` · ★ ${team.captainName}` : ''}</span>
      </div>
      <div className="gauge"><i style={{ width: `${pct}%`, background: team.color }} /></div>
    </article>
  );
}

export default function TeamStrip({ compact }) {
  const { snapshot, teamId, role } = useAuction();
  const [peek, setPeek] = useState(null);
  const leader = snapshot.state.highestBidderTeamId;

  // Keep the popup live while it is open — re-resolve from every snapshot.
  const peekTeam = peek ? snapshot.teams.find((t) => t.id === peek) : null;

  return (
    <>
      <div className="teams-grid">
        {snapshot.teams.map((t) => (
          <TeamCard key={t.id} team={t} compact={compact}
            leading={t.id === leader} mine={role === 'owner' && t.id === teamId}
            onPeek={(team) => setPeek(team.id)} />
        ))}
      </div>
      {peekTeam ? <TeamPeek team={peekTeam} onClose={() => setPeek(null)} /> : null}
    </>
  );
}
