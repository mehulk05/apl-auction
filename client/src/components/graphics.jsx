import React from 'react';

/** "16 seconds ago" style relative time for bid feeds. */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export const initialsOf = (name = '') =>
  name.trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';

let gid = 0;

/** Team crest: a shield in the team's colour with its initials. */
export function TeamCrest({ name = '', color = '#5468FF', size = 28 }) {
  const id = React.useMemo(() => `crest${++gid}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path d="M50 4 L90 18 V50 C90 75 72 90 50 97 C28 90 10 75 10 50 V18 Z"
        fill={`url(#${id})`} stroke="rgba(255,255,255,.35)" strokeWidth="3" />
      <path d="M50 12 L82 23 V50 C82 70 68 83 50 89 C32 83 18 70 18 50 V23 Z"
        fill="rgba(0,0,0,.18)" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Montserrat, sans-serif"
        fontWeight="800" fontSize="34" fill="#fff" style={{ letterSpacing: 1 }}>
        {initialsOf(name)}
      </text>
    </svg>
  );
}

/** Player avatar: a jersey with the player's initials on the chest. */
export function Jersey({ name = '', color = '#5468FF', size = 72 }) {
  const id = React.useMemo(() => `jersey${++gid}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path d="M34 10 L44 5 C46 11 54 11 56 5 L66 10 L91 24 L83 43 L71 37 V93 A3 3 0 0 1 68 96 H32 A3 3 0 0 1 29 93 V37 L17 43 L9 24 Z"
        fill={`url(#${id})`} stroke="rgba(255,255,255,.3)" strokeWidth="2.5" />
      <path d="M44 5 C46 11 54 11 56 5 L60 7 C57 15 43 15 40 7 Z" fill="rgba(0,0,0,.3)" />
      <text x="50" y="62" textAnchor="middle" fontFamily="Montserrat, sans-serif"
        fontWeight="800" fontSize="26" fill="#fff" style={{ letterSpacing: 1 }}>
        {initialsOf(name)}
      </text>
    </svg>
  );
}

export function IconGavel({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4l6 6M12 6l6 6M13 5l-8 8 2 2 8-8zM3 21h9" />
    </svg>
  );
}

export function IconClock({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconPurse({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 9V7a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Purse health: plenty left = green, mid = amber, thin = red. */
export function purseHealth(purse, startingPurse) {
  const pct = startingPurse > 0 ? purse / startingPurse : 0;
  if (pct > 0.55) return { pct, color: 'var(--green)' };
  if (pct > 0.25) return { pct, color: 'var(--brass)' };
  return { pct, color: 'var(--red)' };
}

/** Budget bar: coloured by how much purse is left. */
export function PurseBar({ purse, startingPurse, height = 6 }) {
  const { pct, color } = purseHealth(purse, startingPurse);
  return (
    <div className="purse-bar" style={{ height }}>
      <i style={{ width: `${Math.max(2, Math.round(pct * 100))}%`, background: color }} />
    </div>
  );
}
