/**
 * "Sales King": the app's own mascot, a happy green-and-white capsule with a
 * gold crown, arms up. Drawn in plain SVG (original artwork, no images), so
 * it is crisp at any size and works offline.
 */
export default function SalesKingMascot({ size = 150 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Sales King mascot cheering">
      {/* shadow */}
      <ellipse cx="100" cy="188" rx="46" ry="7" fill="rgba(0,0,0,0.12)" />
      {/* arms (behind the body), raised in a cheer */}
      <path d="M62 112 C40 100 32 80 30 60" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M138 112 C160 100 168 80 170 60" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="30" cy="56" r="10" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" />
      <circle cx="170" cy="56" r="10" fill="#ffffff" stroke="#1f7a3a" strokeWidth="5" />
      {/* legs */}
      <path d="M84 168 L80 184" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
      <path d="M116 168 L120 184" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
      {/* capsule body: green top, white bottom */}
      <clipPath id="sk-body"><rect x="58" y="62" width="84" height="112" rx="42" /></clipPath>
      <g clipPath="url(#sk-body)">
        <rect x="58" y="62" width="84" height="112" fill="#ffffff" />
        <rect x="58" y="62" width="84" height="58" fill="#40c057" />
        <rect x="58" y="116" width="84" height="5" fill="#2f9e44" />
        {/* shine */}
        <rect x="70" y="72" width="10" height="34" rx="5" fill="rgba(255,255,255,0.45)" />
      </g>
      <rect x="58" y="62" width="84" height="112" rx="42" fill="none" stroke="#1f7a3a" strokeWidth="5" />
      {/* face */}
      <ellipse cx="86" cy="96" rx="6" ry="8" fill="#1b1b1b" />
      <ellipse cx="114" cy="96" rx="6" ry="8" fill="#1b1b1b" />
      <circle cx="88" cy="93" r="2.2" fill="#ffffff" />
      <circle cx="116" cy="93" r="2.2" fill="#ffffff" />
      <ellipse cx="76" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
      <ellipse cx="124" cy="108" rx="6" ry="4" fill="#ff8fa3" opacity="0.7" />
      <path d="M86 108 Q100 124 114 108 Q100 116 86 108 Z" fill="#7a1f2b" stroke="#1b1b1b" strokeWidth="3" strokeLinejoin="round" />
      {/* crown */}
      <path d="M72 64 L68 34 L86 50 L100 26 L114 50 L132 34 L128 64 Z" fill="#fcc419" stroke="#b07d00" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="100" cy="26" r="5" fill="#ff6b6b" stroke="#b07d00" strokeWidth="2" />
      <circle cx="68" cy="34" r="4" fill="#4dabf7" stroke="#b07d00" strokeWidth="2" />
      <circle cx="132" cy="34" r="4" fill="#4dabf7" stroke="#b07d00" strokeWidth="2" />
      <rect x="74" y="56" width="52" height="7" rx="3" fill="#f59f00" />
      {/* sparkles */}
      <path d="M22 110 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="#fcc419" />
      <path d="M178 112 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#fcc419" />
      <path d="M160 20 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 z" fill="#40c057" />
    </svg>
  );
}
