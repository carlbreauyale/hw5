// Letters flying between desks. An instruction is a sealed envelope in the sender's colour;
// a report coming back is a yellow folder with a check mark; a refused hand-off is a red
// envelope that turns back halfway. Each flies along an arc over the desks.
import { useEffect, useRef } from 'react'
import { AGENTS } from '../../agents'
import type { Letter, Spot } from '../../usePlayback'

const FLIGHT_MS = 1100

function spot(s: Spot): [number, number] {
  if (s === 'door') return [1000, 470]
  return [AGENTS[s].x, 470]
}

function FlyingLetter({ letter }: { letter: Letter }) {
  const g = useRef<SVGGElement>(null)
  useEffect(() => {
    const [x0, y0] = spot(letter.from)
    const [x1, y1] = spot(letter.to)
    const cx = (x0 + x1) / 2
    const cy = Math.min(y0, y1) - 90 - Math.abs(x1 - x0) * 0.12
    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      let t = Math.min(1, (now - start) / FLIGHT_MS)
      if (letter.kind === 'refused') t = t < 0.5 ? t : 1 - t // turns back halfway
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1
      const tilt = (x1 - x0 > 0 ? 1 : -1) * Math.sin(e * Math.PI) * 14
      const elapsed = (now - start) / FLIGHT_MS
      const fade = elapsed > 0.9 ? Math.max(0, 1 - (elapsed - 0.9) * 10) : 1
      g.current?.setAttribute('transform', `translate(${x} ${y}) rotate(${tilt})`)
      g.current?.setAttribute('opacity', String(fade))
      if (elapsed < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [letter])

  const [x0, y0] = spot(letter.from)
  return (
    <g ref={g} transform={`translate(${x0} ${y0})`} className={`letter letter-${letter.kind}`}>
      <ellipse cx="0" cy="22" rx="12" ry="3" fill="#000" opacity="0.12" />
      {letter.kind === 'report' ? (
        <g>
          <path d="M-17 -11 h12 l3 3 h19 v20 h-34z" fill="#ffd66b" stroke="#c99a12" strokeWidth="1.4" />
          <path d="M-7 1 l4 4 l9 -9" fill="none" stroke="#2f8f5b" strokeWidth="2.6" strokeLinecap="round" />
          <rect x="-17" y="-8" width="34" height="3" fill={letter.color} opacity="0.8" />
        </g>
      ) : (
        <g>
          <rect x="-17" y="-11" width="34" height="23" rx="3" fill={letter.kind === 'refused' ? '#fde3df' : '#fffdf7'}
            stroke={letter.kind === 'refused' ? '#c0392b' : '#9b8f7c'} strokeWidth="1.4" />
          <path d="M-17 -11 l17 13 l17 -13" fill="none" stroke={letter.kind === 'refused' ? '#c0392b' : '#9b8f7c'} strokeWidth="1.4" />
          <circle cx="0" cy="2" r="5" fill={letter.color} />
          {letter.kind === 'refused' && <path d="M-3 -1 l6 6 M3 -1 l-6 6" stroke="#fff" strokeWidth="1.6" />}
        </g>
      )}
    </g>
  )
}

export default function Letters({ letters }: { letters: Letter[] }) {
  return (
    <g className="letters">
      {letters.map((l) => (
        <FlyingLetter key={l.id} letter={l} />
      ))}
    </g>
  )
}
