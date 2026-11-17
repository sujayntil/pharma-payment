/**
 * The Sales King capsule giving a thumbs-up (for "October cleared").
 * Same character as SalesKingMascot: green-and-white capsule, gold crown.
 * One arm raised with a thumbs-up (animated by the parent through the
 * .tm-arm / .tm-body / .tm-eye classes), the other arm on the hip.
 */
export default function ThumbsUpMascot({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Mascot giving a thumbs-up" style={{ overflow: 'visible' }}>
      <ellipse cx="100" cy="190" rx="40" ry="6" fill="rgba(0,0,0,0.12)" />
      <g className="tm-body">
        {/* hip arm (behind the body) */}
        <path d="M62 120 C44 124 40 140 56 148" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
        {/* legs */}
        <path d="M84 168 L80 184" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
        <path d="M116 168 L120 184" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
        {/* capsule body: green top, white bottom */}
        <clipPath id="tm-capsule"><rect x="58" y="62" width="84" height="112" rx="42" /></clipPath>
        <g clipPath="url(#tm-capsule)">
          <rect x="58" y="62" width="84" height="112" fill="#ffffff" />
          <rect x="58" y="62" width="84" height="58" fill="#40c057" />
          <rect x="58" y="116" width="84" height="5" fill="#2f9e44" />
          <rect x="70" y="72" width="10" height="34" rx="5" fill="rgba(255,255,255,0.45)" />
        </g>
        <rect x="58" y="62" width="84" height="112" rx="42" fill="none" stroke="#1f7a3a" strokeWidth="5" />
        {/* face: one eye winks */}
        <ellipse className="tm-eye" cx="86" cy="96" rx="6" ry="8" fill="#1b1b1b" />
        <path d="M107 97 Q114 90 121 97" stroke="#1b1b1b" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="88" cy="93" r="2.2" fill="#ffffff" />
        <ellipse cx="76" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
        <ellipse cx="124" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
        <path d="M86 108 Q100 124 114 108 Q100 116 86 108 Z" fill="#7a1f2b" stroke="#1b1b1b" strokeWidth="3" strokeLinejoin="round" />
        {/* crown */}
        <path d="M72 64 L68 34 L86 50 L100 26 L114 50 L132 34 L128 64 Z" fill="#fcc419" stroke="#b07d00" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="100" cy="26" r="5" fill="#ff6b6b" stroke="#b07d00" strokeWidth="2" />
        <circle cx="68" cy="34" r="4" fill="#4dabf7" stroke="#b07d00" strokeWidth="2" />
        <circle cx="132" cy="34" r="4" fill="#4dabf7" stroke="#b07d00" strokeWidth="2" />
        <rect x="74" y="56" width="52" height="7" rx="3" fill="#f59f00" />
        {/* thumbs-up arm, pivots at the shoulder (138,114) */}
        <g className="tm-arm">
          <path d="M138 114 C152 112 160 104 162 92" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
          {/* thumb (stubby, tilted back) */}
          <rect x="150" y="44" width="15" height="30" rx="7.5" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" transform="rotate(-14 157 70)" />
          {/* fist with three curled fingers */}
          <rect x="150" y="64" width="28" height="30" rx="9" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" />
          <rect x="166" y="66" width="18" height="9" rx="4.5" fill="#ffffff" stroke="#1f7a3a" strokeWidth="4" />
          <rect x="166" y="74" width="18" height="9" rx="4.5" fill="#ffffff" stroke="#1f7a3a" strokeWidth="4" />
          <rect x="166" y="82" width="16" height="9" rx="4.5" fill="#ffffff" stroke="#1f7a3a" strokeWidth="4" />
        </g>
      </g>
      {/* sparkles */}
      <g className="tm-spark" fill="#fcc419">
        <path d="M30 60 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" />
        <path d="M184 28 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" />
      </g>
    </svg>
  );
}
