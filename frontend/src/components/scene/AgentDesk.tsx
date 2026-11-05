// One agent at their desk, seen through the shop window. Each character has their own look and
// props (so you can tell them apart at a glance) and a nameplate with their position. Mood shows
// through the floor glow, the badge over their head, typing arms, and the speech bubble.
import type { AgentMeta } from '../../agents'
import type { AgentVisual } from '../../usePlayback'

const HEAD_Y = 474
const DESK_Y = 552

function Hair({ a }: { a: AgentMeta }) {
  const x = a.x
  switch (a.key) {
    case 'boss': // silver bun + round glasses
      return (
        <g>
          <path d={`M${x - 19} ${HEAD_Y - 2} C${x - 20} ${HEAD_Y - 24} ${x + 20} ${HEAD_Y - 24} ${x + 19} ${HEAD_Y - 2} C${x + 12} ${HEAD_Y - 12} ${x - 12} ${HEAD_Y - 12} ${x - 19} ${HEAD_Y - 2}Z`} fill={a.hair} />
          <circle cx={x} cy={HEAD_Y - 24} r="8" fill={a.hair} />
          <g fill="none" stroke="#2b2b2b" strokeWidth="1.6">
            <circle cx={x - 7} cy={HEAD_Y - 1} r="5.2" />
            <circle cx={x + 7} cy={HEAD_Y - 1} r="5.2" />
            <path d={`M${x - 1.8} ${HEAD_Y - 1} h3.6`} />
          </g>
        </g>
      )
    case 'inventory': // green cap with a brim
      return (
        <g>
          <path d={`M${x - 19} ${HEAD_Y - 4} C${x - 18} ${HEAD_Y - 26} ${x + 18} ${HEAD_Y - 26} ${x + 19} ${HEAD_Y - 4}Z`} fill={a.color} />
          <path d={`M${x + 2} ${HEAD_Y - 6} q16 -2 26 4 q-12 3 -26 2z`} fill="#246f47" />
          <text x={x - 4} y={HEAD_Y - 10} fontSize="9" fontWeight="800" fill="#fff" textAnchor="middle">CC</text>
        </g>
      )
    case 'accounting': // red hair + green eyeshade visor
      return (
        <g>
          <path d={`M${x - 19} ${HEAD_Y} C${x - 22} ${HEAD_Y - 22} ${x + 22} ${HEAD_Y - 22} ${x + 19} ${HEAD_Y}C${x + 10} ${HEAD_Y - 9} ${x - 10} ${HEAD_Y - 9} ${x - 19} ${HEAD_Y}Z`} fill={a.hair} />
          <path d={`M${x - 21} ${HEAD_Y - 8} q21 -9 42 0 l-4 6 q-17 -6 -34 0z`} fill="#3fa35f" opacity="0.92" />
        </g>
      )
    case 'facilities': // yellow hard hat
      return (
        <g>
          <path d={`M${x - 18} ${HEAD_Y - 6} C${x - 18} ${HEAD_Y - 30} ${x + 18} ${HEAD_Y - 30} ${x + 18} ${HEAD_Y - 6}Z`} fill="#f4c430" stroke="#c99a12" strokeWidth="1" />
          <rect x={x - 23} y={HEAD_Y - 8} width="46" height="5" rx="2.5" fill="#e0b020" />
          <rect x={x - 3} y={HEAD_Y - 29} width="6" height="22" rx="3" fill="#e0b020" />
        </g>
      )
    default: // customer service: curls + headset
      return (
        <g>
          {[-15, -8, 0, 8, 15].map((dx, i) => (
            <circle key={i} cx={x + dx} cy={HEAD_Y - 15 + Math.abs(dx) * 0.4} r="8" fill={a.hair} />
          ))}
          <path d={`M${x - 20} ${HEAD_Y} C${x - 20} ${HEAD_Y - 30} ${x + 20} ${HEAD_Y - 30} ${x + 20} ${HEAD_Y}`} fill="none" stroke="#333" strokeWidth="2.6" />
          <rect x={x - 24} y={HEAD_Y - 6} width="7" height="12" rx="3" fill="#333" />
          <rect x={x + 17} y={HEAD_Y - 6} width="7" height="12" rx="3" fill="#333" />
          <path d={`M${x - 21} ${HEAD_Y + 6} q4 12 16 12`} fill="none" stroke="#333" strokeWidth="2" />
          <circle cx={x - 4} cy={HEAD_Y + 18} r="2.4" fill={a.color} />
        </g>
      )
  }
}

function Props({ a, cash }: { a: AgentMeta; cash: number | null }) {
  const x = a.x
  switch (a.key) {
    case 'boss':
      return (
        <g>
          <rect x={x - 52} y={DESK_Y - 18} width="14" height="18" rx="3" fill="#fff" stroke="#00356b" strokeWidth="1.5" />
          <path d={`M${x - 38} ${DESK_Y - 13} q6 0 6 6 q0 5 -6 5`} fill="none" stroke="#00356b" strokeWidth="1.5" />
          <text x={x - 45} y={DESK_Y - 5} fontSize="9" fontWeight="800" fill="#00356b" textAnchor="middle" fontFamily="Georgia, serif">Y</text>
          <path className="steam" d={`M${x - 47} ${DESK_Y - 22} q-3 -6 0 -10 q3 -4 0 -8`} fill="none" stroke="#bbb" strokeWidth="1.4" />
          {/* little bulldog bust */}
          <g transform={`translate(${x + 42} ${DESK_Y - 16})`}>
            <ellipse cx="0" cy="8" rx="10" ry="8" fill="#c9a26b" />
            <circle cx="0" cy="-1" r="8" fill="#d8b47d" />
            <circle cx="-3" cy="-2" r="1.2" fill="#222" />
            <circle cx="3" cy="-2" r="1.2" fill="#222" />
            <ellipse cx="0" cy="2" rx="3" ry="2" fill="#5a3b2e" />
            <path d="M-8 -6 l-3 -4 l5 1z M8 -6 l3 -4 l-5 1z" fill="#b48a55" />
          </g>
        </g>
      )
    case 'inventory':
      return (
        <g>
          <rect x={x - 58} y={DESK_Y - 26} width="26" height="26" fill="#d2a46d" stroke="#a87a45" />
          <path d={`M${x - 58} ${DESK_Y - 26} l13 7 l13 -7`} fill="none" stroke="#a87a45" />
          <rect x={x + 32} y={DESK_Y - 22} width="16" height="22" rx="2" fill="#f4efe3" stroke="#8a6d3b" />
          <rect x={x + 36} y={DESK_Y - 25} width="8" height="5" rx="1" fill="#8a6d3b" />
          {[0, 5, 10].map((d) => <line key={d} x1={x + 35} x2={x + 45} y1={DESK_Y - 16 + d} y2={DESK_Y - 16 + d} stroke="#aaa" />)}
        </g>
      )
    case 'accounting': // a little cash register that shows the real balance
      return (
        <g className="register">
          <rect x={x - 66} y={DESK_Y - 30} width="40" height="30" rx="4" fill="#5d6b7a" />
          <rect x={x - 62} y={DESK_Y - 27} width="32" height="11" rx="2" fill="#123" />
          <text x={x - 46} y={DESK_Y - 18.5} fontSize="7.5" fill="#7dffb2" textAnchor="middle" fontFamily="monospace">
            {cash === null ? '----' : `$${Math.round(cash).toLocaleString()}`}
          </text>
          {[0, 1, 2, 3].map((i) => <rect key={i} x={x - 62 + i * 8} y={DESK_Y - 13} width="6" height="4" rx="1" fill="#cfd6dd" />)}
          <rect className="register-drawer" x={x - 68} y={DESK_Y - 5} width="44" height="6" rx="1.5" fill="#46525e" />
        </g>
      )
    case 'facilities':
      return (
        <g>
          <rect x={x - 58} y={DESK_Y - 9} width="34" height="9" rx="4.5" fill="#cfe3f5" stroke="#5b8fbf" />
          <line x1={x - 52} x2={x - 30} y1={DESK_Y - 4.5} y2={DESK_Y - 4.5} stroke="#5b8fbf" strokeDasharray="3 2" />
          <g transform={`translate(${x + 42} ${DESK_Y - 12})`} stroke="#8a7a3a" strokeWidth="1.6" fill="none">
            <circle r="6" />
            <path d="M4 4 l7 7 l2 -2 M8 8 l2 -2" />
          </g>
        </g>
      )
    default:
      return (
        <g>
          <rect x={x - 60} y={DESK_Y - 12} width="30" height="12" rx="2" fill="#e7d9c4" stroke="#b49c7a" />
          <rect x={x - 56} y={DESK_Y - 17} width="22" height="9" fill="#fff" stroke="#d6456b" strokeWidth="0.8" transform={`rotate(-6 ${x - 45} ${DESK_Y - 12})`} />
          <path d={`M${x - 56} ${DESK_Y - 17} l11 5 l11 -5`} fill="none" stroke="#d6456b" strokeWidth="0.8" transform={`rotate(-6 ${x - 45} ${DESK_Y - 12})`} />
        </g>
      )
  }
}

const BADGE: Record<string, string> = { thinking: '…', working: '⚙', waiting: '⏳', done: '✓' }

export default function AgentDesk({
  a,
  v,
  cash,
  waving,
  spotlight,
}: {
  a: AgentMeta
  v: AgentVisual
  cash: number | null
  waving: boolean
  spotlight: boolean
}) {
  const x = a.x
  const talking = v.bubble?.kind === 'say'
  return (
    <g className={`agent mood-${v.mood}${talking ? ' talking' : ''}${waving ? ' waving' : ''}${spotlight ? ' spotlight' : ''}`}>
      {/* floor glow in the agent's colour while they work */}
      <ellipse className="floor-glow" cx={x} cy={606} rx="72" ry="8" fill={a.color} />

      {/* chair */}
      <rect x={x - 27} y={HEAD_Y + 10} width="54" height="72" rx="12" fill="#3f4656" />

      {/* body */}
      <g className="body">
        <path d={`M${x - 27} ${DESK_Y + 4} C${x - 27} ${HEAD_Y + 38} ${x - 18} ${HEAD_Y + 26} ${x} ${HEAD_Y + 26} C${x + 18} ${HEAD_Y + 26} ${x + 27} ${HEAD_Y + 38} ${x + 27} ${DESK_Y + 4}Z`} fill={a.color} />
        {a.key === 'boss' && (
          <g>
            <path d={`M${x - 9} ${HEAD_Y + 26} L${x} ${HEAD_Y + 44} L${x + 9} ${HEAD_Y + 26}Z`} fill="#fff" />
            <path d={`M${x - 3} ${HEAD_Y + 30} h6 l-1 4 l3 16 l-5 5 l-5 -5 l3 -16z`} fill="#f6c343" />
          </g>
        )}
        {a.key === 'customer_service' && <circle cx={x + 12} cy={HEAD_Y + 40} r="4" fill="#fff" opacity="0.8" />}
        <rect x={x - 5} y={HEAD_Y + 16} width="10" height="12" fill={a.skin} />
        <circle className="head" cx={x} cy={HEAD_Y} r="19" fill={a.skin} />
        <g className="eyes">
          <ellipse cx={x - 7} cy={HEAD_Y - 1} rx="2.2" ry="2.6" fill="#222" />
          <ellipse cx={x + 7} cy={HEAD_Y - 1} rx="2.2" ry="2.6" fill="#222" />
        </g>
        <circle cx={x - 12} cy={HEAD_Y + 6} r="3" fill="#f29a9a" opacity="0.45" />
        <circle cx={x + 12} cy={HEAD_Y + 6} r="3" fill="#f29a9a" opacity="0.45" />
        <path className="mouth" d={`M${x - 6} ${HEAD_Y + 8} Q${x} ${HEAD_Y + 13} ${x + 6} ${HEAD_Y + 8}`} fill="none" stroke="#6b2f2f" strokeWidth="2" strokeLinecap="round" />
        <ellipse className="mouth-open" cx={x} cy={HEAD_Y + 10} rx="4" ry="3" fill="#6b2f2f" />
        <Hair a={a} />
      </g>

      {/* arms: typing when working; the right one waves at Labubu */}
      <g className="arm arm-l">
        <path d={`M${x - 22} ${HEAD_Y + 40} q-10 24 8 ${DESK_Y - HEAD_Y - 40}`} fill="none" stroke={a.color} strokeWidth="9" strokeLinecap="round" />
        <circle cx={x - 13} cy={DESK_Y - 2} r="5" fill={a.skin} />
      </g>
      <g className="arm arm-r" style={{ transformOrigin: `${x + 22}px ${HEAD_Y + 40}px` }}>
        <path d={`M${x + 22} ${HEAD_Y + 40} q10 24 -8 ${DESK_Y - HEAD_Y - 40}`} fill="none" stroke={a.color} strokeWidth="9" strokeLinecap="round" />
        <circle cx={x + 13} cy={DESK_Y - 2} r="5" fill={a.skin} />
      </g>

      {/* raised arm with an open hand, shown instead of the right arm while waving at Labubu */}
      <g className="arm-wave" style={{ transformOrigin: `${x + 22}px ${HEAD_Y + 38}px` }}>
        <path d={`M${x + 22} ${HEAD_Y + 38} Q${x + 44} ${HEAD_Y + 26} ${x + 38} ${HEAD_Y - 4}`}
          fill="none" stroke={a.color} strokeWidth="9" strokeLinecap="round" />
        <g className="open-hand" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8">
          {/* four fingers spread upward, thumb out to the side, palm facing the window */}
          {[-4.6, -1.6, 1.5, 4.5].map((dx, i) => (
            <rect key={i} x={x + 38 + dx - 1.5} y={HEAD_Y - 22 + Math.abs(dx) * 0.5} width="3" height="10" rx="1.5"
              fill={a.skin} transform={`rotate(${dx * 2.2} ${x + 38 + dx} ${HEAD_Y - 12})`} />
          ))}
          <rect x={x + 30} y={HEAD_Y - 13} width="3" height="8" rx="1.5" fill={a.skin} transform={`rotate(-48 ${x + 32} ${HEAD_Y - 7})`} />
          <ellipse cx={x + 38} cy={HEAD_Y - 8} rx="6" ry="6.5" fill={a.skin} />
          <path d={`M${x + 35} ${HEAD_Y - 7} q3 2 6 0`} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
        </g>
      </g>

      {/* desk, laptop, props, nameplate */}
      <rect x={x - 66} y={DESK_Y} width="132" height="10" rx="3" fill="#c08f5f" />
      <rect x={x - 60} y={DESK_Y + 10} width="120" height="44" fill="#a8774a" />
      <g className="laptop">
        <path d={`M${x + 4} ${DESK_Y} l4 -24 h30 l-4 24z`} fill="#2f3542" />
        <path className="screen" d={`M${x + 8} ${DESK_Y - 3} l3.4 -18 h24 l-3.4 18z`} fill="#9fb0c3" />
        <rect x={x + 2} y={DESK_Y - 2} width="40" height="3" rx="1.5" fill="#596275" />
      </g>
      <Props a={a} cash={cash} />
      <g className="nameplate">
        <rect x={x - 48} y={DESK_Y + 12} width="96" height="28" rx="4" fill="#fbf3e2" stroke={a.color} strokeWidth="2" />
        <text x={x} y={DESK_Y + 24} textAnchor="middle" className="plate-name">{a.name}</text>
        <text x={x} y={DESK_Y + 35} textAnchor="middle" className="plate-title" fill={a.color}>{a.title.toUpperCase()}</text>
      </g>

      {/* mood badge */}
      {v.mood !== 'idle' && (
        <g className="badge">
          <circle cx={x + 24} cy={HEAD_Y - 26} r="10" fill="#fff" stroke={a.color} strokeWidth="2" />
          <text x={x + 24} y={HEAD_Y - 22} textAnchor="middle" fontSize="11" fontWeight="800" fill={a.color}>{BADGE[v.mood]}</text>
        </g>
      )}

      {/* tool chip floats up from the laptop */}
      {v.toolIcon && v.mood === 'working' && (
        <g key={v.toolId} className="tool-chip">
          <circle cx={x + 24} cy={DESK_Y - 34} r="11" fill="#fff" stroke={a.color} strokeWidth="1.5" />
          <text x={x + 24} y={DESK_Y - 30} textAnchor="middle" fontSize="12">{v.toolIcon}</text>
        </g>
      )}

      {/* speech / thought bubble */}
      {v.bubble && (
        <foreignObject key={v.bubble.id} x={x - 76} y={HEAD_Y - 150} width="152" height="118" className="bubble-fo">
          <div className="bubble-wrap">
            <div className={`bubble bubble-${v.bubble.kind}`} style={{ borderColor: a.color }}>
              {v.bubble.text}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}
