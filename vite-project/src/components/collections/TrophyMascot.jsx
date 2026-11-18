/**
 * The Sales King mascot holding a gold trophy up with both hands (for the
 * "month cleared" celebration). Same capsule body, crown and face as
 * SalesKingMascot; plain SVG (original artwork). The trophy is its own group
 * (data-trophy) so the celebration can lift it out and fly it to the counter.
 */
export default function TrophyMascot({ size = 220, hideTrophy = false }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 -70 200 260" role="img" aria-label="Sales King mascot holding a trophy">
      <defs>
        <linearGradient id="tm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3bf" />
          <stop offset="0.45" stopColor="#fcc419" />
          <stop offset="1" stopColor="#e67700" />
        </linearGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="100" cy="186" rx="46" ry="7" fill="rgba(0,0,0,0.18)" />
      {/* arms up, hands meeting under the trophy */}
      <path d="M62 112 C44 96 46 40 70 8" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M138 112 C156 96 154 40 130 8" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* trophy */}
      <g data-trophy style={{ opacity: hideTrophy ? 0 : 1 }}>
        <path d="M72 -58 h56 v26 c0 18 -12 32 -28 32 s-28 -14 -28 -32 z" fill="url(#tm-gold)" stroke="#b07d00" strokeWidth="3" />
        <path d="M72 -50 H58 c0 17 8 26 20 26 M128 -50 h14 c0 17 -8 26 -20 26" stroke="#e8a400" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="93" y="-2" width="14" height="10" fill="#e8a400" stroke="#b07d00" strokeWidth="2" />
        <rect x="80" y="7" width="40" height="11" rx="3" fill="#b07d00" />
        <path d="M100 -48 l4.5 9 l10 1.5 l-7.2 7 l1.7 10 l-9 -4.7 l-9 4.7 l1.7 -10 l-7.2 -7 l10 -1.5 z" fill="#fff9db" opacity="0.95" />
        <rect x="80" y="-52" width="6" height="22" rx="3" fill="rgba(255,255,255,0.55)" />
      </g>
      {/* hands on the trophy */}
      <circle cx="70" cy="10" r="10" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" />
      <circle cx="130" cy="10" r="10" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" />
      {/* legs */}
      <path d="M84 168 L80 182" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
      <path d="M116 168 L120 182" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
      {/* capsule body: green top, white bottom */}
      <clipPath id="tm-body"><rect x="58" y="62" width="84" height="112" rx="42" /></clipPath>
      <g clipPath="url(#tm-body)">
        <rect x="58" y="62" width="84" height="112" fill="#ffffff" />
        <rect x="58" y="62" width="84" height="58" fill="#40c057" />
        <rect x="58" y="116" width="84" height="5" fill="#2f9e44" />
        <rect x="70" y="72" width="10" height="34" rx="5" fill="rgba(255,255,255,0.45)" />
      </g>
      <rect x="58" y="62" width="84" height="112" rx="42" fill="none" stroke="#1f7a3a" strokeWidth="5" />
      {/* face: big happy eyes */}
      <ellipse cx="86" cy="96" rx="6" ry="8" fill="#1b1b1b" />
      <ellipse cx="114" cy="96" rx="6" ry="8" fill="#1b1b1b" />
      <circle cx="88" cy="93" r="2.2" fill="#ffffff" />
      <circle cx="116" cy="93" r="2.2" fill="#ffffff" />
      <ellipse cx="76" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
      <ellipse cx="124" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
      <path d="M84 107 Q100 128 116 107 Q100 117 84 107 Z" fill="#7a1f2b" stroke="#1b1b1b" strokeWidth="3" strokeLinejoin="round" />
      {/* crown */}
      <path d="M74 64 L70 38 L87 52 L100 30 L113 52 L130 38 L126 64 Z" fill="#fcc419" stroke="#b07d00" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="100" cy="30" r="5" fill="#ff6b6b" stroke="#b07d00" strokeWidth="2" />
      <rect x="76" y="57" width="48" height="7" rx="3" fill="#f59f00" />
    </svg>
  );
}

/** Just the trophy (the counter icon and the one that flies to it). */
export function TrophyIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="56 -60 88 80" aria-hidden="true">
      <path d="M72 -58 h56 v26 c0 18 -12 32 -28 32 s-28 -14 -28 -32 z" fill="#fcc419" stroke="#b07d00" strokeWidth="3" />
      <path d="M72 -50 H58 c0 17 8 26 20 26 M128 -50 h14 c0 17 -8 26 -20 26" stroke="#e8a400" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="93" y="-2" width="14" height="10" fill="#e8a400" />
      <rect x="80" y="7" width="40" height="11" rx="3" fill="#b07d00" />
    </svg>
  );
}
