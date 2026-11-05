// Spring in New Haven behind the shop: soft sky, sun, drifting clouds, birds, a skyline of Yale
// buildings (Gothic towers and halls) with Evans Hall's glass and wavy roof peeking through,
// blossoming trees, grass and the sidewalk. All original vector drawings.

function Cloud({ x, y, s, cls }: { x: number; y: number; s: number; cls: string }) {
  return (
    <g className={`cloud ${cls}`}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity="0.92">
        <ellipse cx="0" cy="10" rx="46" ry="16" />
        <ellipse cx="-22" cy="2" rx="22" ry="18" />
        <ellipse cx="12" cy="-6" rx="28" ry="24" />
        <ellipse cx="38" cy="6" rx="20" ry="14" />
      </g>
    </g>
  )
}

function GothicTower({ x, base, w, h }: { x: number; base: number; w: number; h: number }) {
  // A Harkness-style tower: stacked stages, pinnacles, lancet windows.
  const top = base - h
  return (
    <g fill="#9fb3c8" stroke="#8aa0b6" strokeWidth="1">
      <rect x={x - w / 2} y={top + h * 0.35} width={w} height={h * 0.65} />
      <rect x={x - w * 0.4} y={top + h * 0.18} width={w * 0.8} height={h * 0.2} />
      <rect x={x - w * 0.3} y={top + h * 0.06} width={w * 0.6} height={h * 0.14} />
      <path d={`M${x - w * 0.22} ${top + h * 0.06} L${x} ${top - h * 0.06} L${x + w * 0.22} ${top + h * 0.06}Z`} />
      {[-0.5, -0.17, 0.17, 0.5].map((f) => (
        <path key={f} d={`M${x + f * w - 3} ${top + h * 0.35} l3 -14 l3 14Z`} />
      ))}
      {[-0.4, 0.4].map((f) => (
        <path key={f} d={`M${x + f * w * 0.8 - 2.5} ${top + h * 0.18} l2.5 -11 l2.5 11Z`} />
      ))}
      {[0.45, 0.62, 0.79].map((f) => (
        <g key={f} fill="#7f95ad" stroke="none">
          <path d={`M${x - w * 0.2} ${top + h * f + 16} v-10 q${w * 0.08} -8 ${w * 0.16} 0 v10Z`} />
          <path d={`M${x + w * 0.04} ${top + h * f + 16} v-10 q${w * 0.08} -8 ${w * 0.16} 0 v10Z`} />
        </g>
      ))}
    </g>
  )
}

function GothicHall({ x, base, w, h }: { x: number; base: number; w: number; h: number }) {
  const top = base - h
  const gables = Math.max(2, Math.round(w / 44))
  return (
    <g fill="#b2c2d3" stroke="#9db0c4" strokeWidth="1">
      <rect x={x} y={top} width={w} height={h} />
      {Array.from({ length: gables }).map((_, i) => {
        const gx = x + (w / gables) * i
        const gw = w / gables
        return <path key={i} d={`M${gx} ${top} L${gx + gw / 2} ${top - 18} L${gx + gw} ${top}Z`} />
      })}
      {Array.from({ length: gables * 2 }).map((_, i) => (
        <path key={i} fill="#93a8be" stroke="none"
          d={`M${x + 8 + i * ((w - 16) / (gables * 2))} ${top + h * 0.7} v-18 q5 -7 10 0 v18Z`} />
      ))}
    </g>
  )
}

function EvansHall({ x, base }: { x: number; base: number }) {
  // Yale SOM's Evans Hall: a glass building with a soft, undulating roofline and
  // horizontal floor bands; drawn in light sky-glass so it reads as distant.
  const w = 230
  const top = base - 120
  const roof = `M${x} ${top + 14} C${x + 30} ${top - 4}, ${x + 60} ${top + 22}, ${x + 92} ${top + 8}
    S${x + 150} ${top - 6}, ${x + 180} ${top + 10} S${x + 220} ${top + 2}, ${x + w} ${top + 12}
    L${x + w} ${base} L${x} ${base}Z`
  return (
    <g className="evans">
      <path d={roof} fill="url(#evansGlass)" stroke="#7fa6c4" strokeWidth="1.4" />
      {[22, 44, 66, 88, 110].map((dy) => (
        <line key={dy} x1={x + 2} x2={x + w - 2} y1={top + dy} y2={top + dy} stroke="#e8f4ff" strokeWidth="2" opacity="0.8" />
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={i} x1={x + 12 + i * 21} x2={x + 12 + i * 21} y1={top + 14} y2={base} stroke="#a9c7de" strokeWidth="0.8" />
      ))}
      <path d={`M${x + 40} ${top + 26} l40 70`} stroke="#fff" strokeWidth="6" opacity="0.35" />
      <path d={`M${x + 140} ${top + 20} l30 60`} stroke="#fff" strokeWidth="4" opacity="0.3" />
      <g className="evans-label">
        <text x={x + w / 2 + 40} y={top - 34} textAnchor="middle" className="hand">Evans Hall</text>
        <path d={`M${x + w / 2 + 34} ${top - 28} q-8 12 -2 24`} fill="none" stroke="#335" strokeWidth="1.4" markerEnd="url(#arrowHead)" />
      </g>
    </g>
  )
}

function BlossomTree({ x, base, s = 1, color = '#f7b6c8' }: { x: number; base: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${base}) scale(${s})`} className="tree">
      <path d="M-6 0 C-4 -40 -10 -70 -2 -96 M4 0 C2 -40 10 -64 4 -90 M-2 -60 C-24 -78 -40 -86 -52 -92 M2 -66 C20 -84 36 -88 50 -96"
        stroke="#6b4a3a" strokeWidth="9" fill="none" strokeLinecap="round" />
      <g className="canopy">
        {[[-52, -104, 34], [-18, -128, 42], [24, -120, 40], [52, -100, 30], [0, -94, 36], [-36, -84, 26], [36, -82, 26]].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={color} opacity={0.82 + (i % 3) * 0.05} />
        ))}
        {[[-40, -112], [-6, -140], [30, -128], [50, -106], [8, -100], [-26, -92], [22, -90], [-54, -96]].map(([cx, cy], i) => (
          <circle key={`w${i}`} cx={cx} cy={cy} r="5" fill="#fff" opacity="0.75" />
        ))}
      </g>
    </g>
  )
}

function LeafyTree({ x, base, s = 1 }: { x: number; base: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${base}) scale(${s})`} className="tree">
      <rect x="-5" y="-60" width="10" height="60" fill="#6b4a3a" />
      <circle cx="0" cy="-86" r="36" fill="#86c46d" />
      <circle cx="-24" cy="-68" r="24" fill="#79b862" />
      <circle cx="24" cy="-66" r="24" fill="#93cf78" />
    </g>
  )
}

export default function Backdrop() {
  return (
    <g>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd6ff" />
          <stop offset="0.55" stopColor="#cfeaff" />
          <stop offset="1" stopColor="#fff4e2" />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0" stopColor="#fff6c4" stopOpacity="1" />
          <stop offset="1" stopColor="#fff6c4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="evansGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d7ecfb" />
          <stop offset="0.5" stopColor="#b5d6ee" />
          <stop offset="1" stopColor="#cfe6f7" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8dc8a" />
          <stop offset="1" stopColor="#7cc26a" />
        </linearGradient>
        <marker id="arrowHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10z" fill="#335" />
        </marker>
      </defs>

      <rect width="1200" height="760" fill="url(#sky)" />

      {/* sun */}
      <g className="sun">
        <circle cx="1100" cy="86" r="90" fill="url(#sunGlow)" />
        <g className="sun-rays" stroke="#ffd768" strokeWidth="4" strokeLinecap="round">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6
            return <line key={i} x1={1100 + Math.cos(a) * 44} y1={86 + Math.sin(a) * 44} x2={1100 + Math.cos(a) * 60} y2={86 + Math.sin(a) * 60} />
          })}
        </g>
        <circle cx="1100" cy="86" r="34" fill="#ffd95a" />
      </g>

      <Cloud x={160} y={70} s={1} cls="c1" />
      <Cloud x={520} y={46} s={0.8} cls="c2" />
      <Cloud x={860} y={96} s={0.65} cls="c3" />

      {/* birds */}
      <g className="birds" stroke="#3d4b5c" strokeWidth="2" fill="none" strokeLinecap="round">
        <path className="bird b1" d="M0 0 q6 -6 12 0 q6 -6 12 0" transform="translate(300 120)" />
        <path className="bird b2" d="M0 0 q5 -5 10 0 q5 -5 10 0" transform="translate(330 104)" />
      </g>

      {/* distant Yale skyline: Gothic halls and towers, with Evans Hall seen between them */}
      <g className="skyline" opacity="0.95">
        <GothicHall x={0} base={330} w={150} h={120} />
        <GothicTower x={120} base={330} w={54} h={250} />
        <GothicHall x={300} base={300} w={170} h={110} />
        <GothicTower x={480} base={300} w={44} h={190} />
        <GothicHall x={630} base={300} w={130} h={128} />
        <EvansHall x={800} base={300} />
        <GothicTower x={1030} base={330} w={50} h={210} />
        <GothicHall x={1060} base={330} w={140} h={110} />
      </g>

      {/* lawn and trees */}
      <path d="M0 330 C200 300 400 322 600 312 S1000 300 1200 326 V650 H0Z" fill="url(#grass)" />
      <LeafyTree x={40} base={430} s={1.1} />
      <BlossomTree x={96} base={560} s={1.25} />
      <BlossomTree x={1128} base={560} s={1.2} color="#f9c8d6" />
      <LeafyTree x={1180} base={440} s={1} />
    </g>
  )
}

export function Petals() {
  // Cherry-blossom petals drifting across the whole scene.
  const petals = Array.from({ length: 16 }).map((_, i) => ({
    x: (i * 83) % 1200,
    delay: (i * 1.7) % 12,
    dur: 10 + (i % 5) * 2.2,
    s: 0.7 + (i % 3) * 0.25,
  }))
  return (
    <g className="petals" aria-hidden="true">
      {petals.map((p, i) => (
        <g key={i} className="petal" style={{ animationDelay: `-${p.delay}s`, animationDuration: `${p.dur}s` }}>
          <ellipse cx={p.x} cy="-10" rx={5 * p.s} ry={3 * p.s} fill={i % 2 ? '#f7b6c8' : '#fde2ea'} />
        </g>
      ))}
    </g>
  )
}

export function Butterfly() {
  return (
    <g className="butterfly" aria-hidden="true">
      <g className="wings">
        <path d="M0 0 C-12 -14 -18 -2 -10 6 Z" fill="#f6c343" />
        <path d="M0 0 C12 -14 18 -2 10 6 Z" fill="#f6c343" />
        <path d="M0 0 C-8 4 -10 12 -3 10 Z" fill="#f39c3d" />
        <path d="M0 0 C8 4 10 12 3 10 Z" fill="#f39c3d" />
      </g>
      <rect x="-1" y="-4" width="2" height="12" rx="1" fill="#333" />
    </g>
  )
}
