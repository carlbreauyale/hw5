// The shop, seen from the sidewalk on a spring morning: the Campus Customs storefront with its
// sign and striped awning, and through the big window the five agents at their desks. Letters
// fly between desks as work is handed off; the corkboard shows the ticket in play and gets a
// RESOLVED stamp when the team finishes. Now and then Labubu strolls by and peeks in.
import { useMemo, useState } from 'react'
import { AGENTS, SEAT_ORDER } from '../../agents'
import type { Ticket } from '../../types'
import type { AgentVisual, Letter } from '../../usePlayback'
import type { AgentKey } from '../../types'
import AgentDesk from './AgentDesk'
import Backdrop, { Butterfly, Petals } from './Backdrop'
import Letters from './Letters'
import { WalkingLabubu } from './Labubu'

interface Props {
  agents: Record<AgentKey, AgentVisual>
  letters: Letter[]
  cash: number | null
  ticket: Ticket | null
  running: boolean
  stamped: boolean
  shopToday: string | null
}

function Bricks() {
  return (
    <pattern id="bricks" width="44" height="22" patternUnits="userSpaceOnUse">
      <rect width="44" height="22" fill="#b5523b" />
      <path d="M0 0.5 H44 M0 11.5 H44 M22 0 V11 M0 11 V22 M44 11 V22" stroke="#9a4330" strokeWidth="1.4" />
      <rect x="2" y="2" width="18" height="7" fill="#bf5d44" opacity="0.6" />
      <rect x="25" y="13" width="16" height="7" fill="#a94b35" opacity="0.6" />
    </pattern>
  )
}

function Clock() {
  const now = useMemo(() => new Date(), [])
  const h = ((now.getHours() % 12) + now.getMinutes() / 60) * 30
  const m = now.getMinutes() * 6
  return (
    <g>
      <circle cx="560" cy="354" r="17" fill="#fff" stroke="#00356b" strokeWidth="3" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="560" y1="340" x2="560" y2="343" stroke="#00356b" strokeWidth="1.4" transform={`rotate(${i * 30} 560 354)`} />
      ))}
      <line x1="560" y1="354" x2="560" y2="345" stroke="#222" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${h} 560 354)`} />
      <line x1="560" y1="354" x2="560" y2="341" stroke="#222" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${m} 560 354)`} />
      <line className="second-hand" x1="560" y1="356" x2="560" y2="340" stroke="#d6456b" strokeWidth="1" />
      <circle cx="560" cy="354" r="1.8" fill="#d6456b" />
    </g>
  )
}

function Shelves() {
  return (
    <g>
      {/* left wall shelf: hoodies and tees */}
      <rect x="185" y="371" width="270" height="6" fill="#8b5e3c" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${196 + i * 52} 349)`}>
          <rect width="40" height="22" rx="3" fill={i % 2 ? '#f6f6f2' : '#00356b'} stroke="#0002" />
          <rect x="12" y="4" width="16" height="4" rx="2" fill={i % 2 ? '#00356b' : '#fff'} opacity="0.7" />
        </g>
      ))}
      <rect x="185" y="419" width="120" height="5" fill="#8b5e3c" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={194 + i * 36} y="398" width="30" height="21" fill="#d2a46d" stroke="#a87a45" />
      ))}
      {/* right wall shelf: mugs and caps */}
      <rect x="665" y="371" width="270" height="6" fill="#8b5e3c" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${720 + i * 50} 350)`}>
          <rect width="20" height="21" rx="3" fill="#fff" stroke="#00356b" strokeWidth="1.6" />
          <path d="M20 5 q7 0 7 6 q0 6 -7 6" fill="none" stroke="#00356b" strokeWidth="1.6" />
        </g>
      ))}
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(${838 + i * 46} 410)`}>
          <path d="M0 9 C0 -4 30 -4 30 9Z" fill="#1d5fa8" />
          <path d="M22 9 h14 q-2 4 -14 3z" fill="#174c87" />
        </g>
      ))}
      {/* Yale pennant */}
      <g transform="translate(472 396)">
        <path d="M0 0 L58 12 L0 24Z" fill="#00356b" />
        <text x="16" y="16" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Georgia, serif">YALE</text>
      </g>
    </g>
  )
}

function Corkboard({ ticket, stamped, running }: { ticket: Ticket | null; stamped: boolean; running: boolean }) {
  return (
    <g className="corkboard">
      <rect x="606" y="384" width="92" height="56" rx="4" fill="#c99a63" stroke="#8b5e3c" strokeWidth="3" />
      <g transform="rotate(-3 652 412)">
        <rect x="616" y="390" width="72" height="44" fill="#fffbe8" />
        <circle cx="652" cy="392" r="3" fill="#d6456b" />
        {ticket ? (
          <>
            <text x="652" y="406" textAnchor="middle" className="note-id">#{ticket.id}</text>
            <text x="652" y="418" textAnchor="middle" className="note-sub">{ticket.subject.slice(0, 18)}</text>
            <text x="652" y="429" textAnchor="middle" className="note-sub">{running ? 'team working…' : ticket.requester.slice(0, 18)}</text>
          </>
        ) : (
          <text x="652" y="416" textAnchor="middle" className="note-sub">pick a ticket</text>
        )}
      </g>
      {stamped && (
        <g className="stamp" transform="rotate(-14 652 412)">
          <rect x="612" y="400" width="80" height="22" rx="3" fill="none" stroke="#c0392b" strokeWidth="2.6" />
          <text x="652" y="416" textAnchor="middle" className="stamp-text">RESOLVED</text>
        </g>
      )}
    </g>
  )
}

function Tulips({ x0, x1 }: { x0: number; x1: number }) {
  const colors = ['#ff5f7e', '#ffd34d', '#ff8fb1', '#ffffff', '#ff6b4a']
  const n = Math.floor((x1 - x0) / 22)
  return (
    <g>
      <rect x={x0} y="626" width={x1 - x0} height="24" rx="3" fill="#7a4b2f" />
      <rect x={x0 - 4} y="623" width={x1 - x0 + 8} height="6" rx="2" fill="#8d5a3b" />
      {Array.from({ length: n }).map((_, i) => {
        const x = x0 + 11 + i * 22
        return (
          <g key={i} className="tulip" style={{ animationDelay: `${-(i % 5) * 0.6}s` }}>
            <path d={`M${x} 625 C${x - 2} 618 ${x + 2} 614 ${x} 609`} stroke="#3f9e4d" strokeWidth="2.4" fill="none" />
            <path d={`M${x} 622 q-8 -3 -9 -9 q7 2 9 7`} fill="#4caf5a" />
            <path d={`M${x - 5} 609 q0 -10 5 -12 q5 2 5 12 q-5 4 -10 0z`} fill={colors[i % colors.length]} />
          </g>
        )
      })}
    </g>
  )
}

export default function StoreScene({ agents, letters, cash, ticket, running, stamped, shopToday }: Props) {
  const [peeking, setPeeking] = useState(false)
  const day = shopToday ? new Date(`${shopToday}T12:00:00`) : null
  const dayText = day ? day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'
  const anyActive = SEAT_ORDER.some((k) => agents[k].mood !== 'idle')

  return (
    <svg className="scene" viewBox="0 0 1200 760" role="img"
      aria-label="The Campus Customs shop seen from the street, with the agent team working inside">
      <defs>
        <Bricks />
        <clipPath id="windowClip">
          <rect x="175" y="330" width="770" height="282" />
        </clipPath>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#bfe3ff" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="interiorLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7e6" />
          <stop offset="1" stopColor="#f1e1c4" />
        </linearGradient>
      </defs>

      <Backdrop />

      {/* ---------- storefront ---------- */}
      <rect x="150" y="250" width="900" height="400" fill="url(#bricks)" />
      <rect x="140" y="236" width="920" height="16" fill="#efe6d6" />
      {Array.from({ length: 46 }).map((_, i) => (
        <rect key={i} x={146 + i * 20} y="252" width="10" height="6" fill="#d9cdb8" />
      ))}

      {/* sign on the parapet */}
      <g className="shop-sign">
        <rect x="440" y="222" width="10" height="16" fill="#5b4636" />
        <rect x="750" y="222" width="10" height="16" fill="#5b4636" />
        <rect x="410" y="160" width="380" height="66" rx="10" fill="#00356b" stroke="#f6c343" strokeWidth="4" />
        <rect x="418" y="168" width="364" height="50" rx="7" fill="none" stroke="#f6c343" strokeWidth="1.2" opacity="0.7" />
        <text x="600" y="200" textAnchor="middle" className="sign-title">CAMPUS CUSTOMS</text>
        <text x="600" y="215" textAnchor="middle" className="sign-sub">YALE GEAR · NEW HAVEN · THE AGENT DESK</text>
        {Array.from({ length: 13 }).map((_, i) => (
          <circle key={i} className="bulb" style={{ animationDelay: `${i * 0.18}s` }} cx={424 + i * 29.3} cy="160" r="3.6" fill="#ffe9a3" />
        ))}
      </g>

      {/* interior through the window */}
      <g clipPath="url(#windowClip)">
        <rect x="175" y="330" width="770" height="230" fill="url(#interiorLight)" />
        <rect x="175" y="520" width="770" height="40" fill="#e5d2b0" />
        <rect x="175" y="560" width="770" height="52" fill="#c89f74" />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={175 + i * 70} y1="560" x2={175 + i * 70 - 30} y2="612" stroke="#b88c60" strokeWidth="2" />
        ))}
        <Shelves />
        <Clock />
        <Corkboard ticket={ticket} stamped={stamped} running={running} />
        {/* pendant lamps */}
        {[330, 560, 790].map((x) => (
          <g key={x} className={anyActive ? 'lamp on' : 'lamp'}>
            <line x1={x} y1="330" x2={x} y2="338" stroke="#555" />
            <path d={`M${x - 12} 346 q12 -12 24 0z`} fill="#f6c343" />
            <ellipse className="lamp-light" cx={x} cy="400" rx="60" ry="70" fill="#fff3c4" />
          </g>
        ))}
      </g>

      {/* the team (drawn over the window so their bubbles can pop up past the frame) */}
      {SEAT_ORDER.map((k) => (
        <AgentDesk key={k} a={AGENTS[k]} v={agents[k]} cash={cash}
          waving={peeking && (k === 'customer_service' || k === 'boss') && agents[k].mood === 'idle'}
          spotlight={agents[k].mood !== 'idle'} />
      ))}

      {/* glass reflection + window frame */}
      <rect x="175" y="330" width="770" height="282" fill="url(#glass)" pointerEvents="none" />
      <path d="M210 330 l-35 60 v-60z M300 330 l-120 210 h-5 v-20 l108 -190z" fill="#fff" opacity="0.18" pointerEvents="none" />
      <path d="M760 612 l120 -282 h22 l-120 282z" fill="#fff" opacity="0.1" pointerEvents="none" />
      <rect x="170" y="326" width="780" height="290" fill="none" stroke="#efe6d6" strokeWidth="10" />
      <rect x="480" y="330" width="5" height="282" fill="#efe6d6" />
      <rect x="636" y="330" width="5" height="282" fill="#efe6d6" />
      <rect x="160" y="612" width="800" height="10" rx="2" fill="#efe6d6" />

      {/* striped awning */}
      <g className="awning">
        {Array.from({ length: 16 }).map((_, i) => (
          <path key={i} d={`M${165 + i * 49.4} 286 h49.4 v32 q-24.7 14 -49.4 0z`} fill={i % 2 ? '#ffffff' : '#00356b'} />
        ))}
        <rect x="160" y="280" width="800" height="9" rx="3" fill="#002a55" />
      </g>

      {/* door */}
      <g className="door">
        <rect x="962" y="336" width="76" height="314" fill="#efe6d6" />
        <rect x="968" y="342" width="64" height="308" fill="#00356b" />
        <rect x="976" y="352" width="48" height="140" rx="3" fill="#cfe9ff" opacity="0.85" />
        <path d="M982 352 l-6 30 v-30z" fill="#fff" opacity="0.5" />
        <circle cx="1022" cy="520" r="4" fill="#f6c343" />
        <line x1="988" y1="352" x2="1000" y2="384" stroke="#999" />
        <line x1="1012" y1="352" x2="1000" y2="384" stroke="#999" />
        <g className={running ? 'open-sign busy' : 'open-sign'}>
          <rect x="980" y="384" width="40" height="18" rx="4" fill="#fff" stroke={running ? '#f39c3d' : '#d6456b'} strokeWidth="2" />
          <text x="1000" y="397" textAnchor="middle" className="open-text" fill={running ? '#d9822b' : '#d6456b'}>
            {running ? 'BUSY' : 'OPEN'}
          </text>
        </g>
        <rect x="958" y="648" width="84" height="6" fill="#6b4a3a" />
      </g>

      <Tulips x0={186} x1={500} />
      <Tulips x0={640} x1={934} />

      {/* sidewalk and street */}
      <rect x="0" y="650" width="1200" height="62" fill="#dcd8d0" />
      {Array.from({ length: 16 }).map((_, i) => (
        <line key={i} x1={i * 80} y1="650" x2={i * 80} y2="712" stroke="#c7c2b8" strokeWidth="2" />
      ))}
      <rect x="0" y="708" width="1200" height="6" fill="#bdb7ab" />
      <rect x="0" y="714" width="1200" height="46" fill="#5c6168" />
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={30 + i * 130} y="735" width="60" height="5" rx="2" fill="#f2f2f2" opacity="0.8" />
      ))}

      {/* the blue crate Labubu stands on to peek in */}
      <g>
        <rect x="532" y="662" width="80" height="44" rx="3" fill="#1d5fa8" />
        {[0, 1, 2].map((i) => <rect key={i} x="536" y={667 + i * 13} width="72" height="7" rx="2" fill="#174c87" />)}
      </g>

      {/* street lamp */}
      <g>
        <rect x="64" y="430" width="8" height="280" fill="#2b3440" />
        <path d="M52 430 h32 l-6 -26 h-20z" fill="#2b3440" />
        <rect x="58" y="408" width="20" height="18" fill="#fff6c4" opacity="0.9" />
        <circle cx="68" cy="402" r="4" fill="#2b3440" />
      </g>

      {/* chalkboard A-frame sign on the sidewalk */}
      <g className="chalkboard">
        <path d="M1062 708 l14 -118 h88 l14 118" fill="none" stroke="#8d5a3b" strokeWidth="6" />
        <rect x="1072" y="590" width="96" height="104" rx="4" fill="#2d3b33" stroke="#8d5a3b" strokeWidth="4" />
        <text x="1120" y="614" textAnchor="middle" className="chalk">TODAY</text>
        <text x="1120" y="633" textAnchor="middle" className="chalk small">{dayText}</text>
        <path d="M1094 643 h52" stroke="#f4f1e8" strokeWidth="1" opacity="0.35" />
        <text x="1120" y="662" textAnchor="middle" className="chalk welcome">WELCOME</text>
        <text x="1120" y="679" textAnchor="middle" className="chalk welcome">IN!</text>
      </g>

      <Petals />
      <g transform="translate(940 600)"><Butterfly /></g>
      <WalkingLabubu onPeek={setPeeking} />
      <Letters letters={letters} />
    </svg>
  )
}
