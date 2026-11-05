// The Labubu-inspired buddy from assignment 4 (original drawing: tall bunny ears, big eyes,
// toothy grin, Yale tee), with a spring flower behind one ear. Used in two places:
//  * LabubuFigure      the drawing itself (the header logo waves its arm on hover)
//  * WalkingLabubu     every so often she strolls along the sidewalk, stops at the window to
//                      peek inside at the team, then carries on her route.
import { useEffect, useRef, useState } from 'react'

export function LabubuFigure({ walking = false, flower = true }: { walking?: boolean; flower?: boolean }) {
  return (
    <g className={`labubu-fig${walking ? ' is-walking' : ''}`}>
      {/* ears */}
      <g fill="#c8b6a4" stroke="#8a7462" strokeWidth="1.2">
        <path d="M18 30 C10 18 11 4 17 2 C23 0 25 16 24 28Z" />
        <path d="M46 30 C54 18 53 4 47 2 C41 0 39 16 40 28Z" />
      </g>
      <path d="M19 27 C14 18 15 8 17.5 6 C20 5 22 16 22 26Z" fill="#f2b8bf" />
      <path d="M45 27 C50 18 49 8 46.5 6 C44 5 42 16 42 26Z" fill="#f2b8bf" />
      {flower && (
        <g transform="translate(48 22)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-3.2" rx="2.2" ry="3.2" fill="#ff9ec0" transform={`rotate(${a})`} />
          ))}
          <circle r="1.8" fill="#ffd95a" />
        </g>
      )}
      {/* legs (they swing while walking) */}
      <g className="labubu-leg leg-l">
        <ellipse cx="24" cy="76" rx="6" ry="3" fill="#c8b6a4" stroke="#8a7462" strokeWidth="1" />
      </g>
      <g className="labubu-leg leg-r">
        <ellipse cx="40" cy="76" rx="6" ry="3" fill="#c8b6a4" stroke="#8a7462" strokeWidth="1" />
      </g>
      {/* resting arm */}
      <path d="M17 52 C12 56 11 61 13 64" fill="none" stroke="#c8b6a4" strokeWidth="5" strokeLinecap="round" />
      {/* body in a Yale tee */}
      <path d="M18 50 C18 46 46 46 46 50 L48 70 C48 75 16 75 16 70Z" fill="#00366b" />
      <text x="32" y="66" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Georgia, serif">Y</text>
      {/* fuzzy head */}
      <path d="M12 36 C10 24 20 20 32 20 C44 20 54 24 52 36 C54 42 50 50 32 50 C14 50 10 42 12 36Z"
        fill="#c8b6a4" stroke="#8a7462" strokeWidth="1.2" />
      <ellipse cx="32" cy="38" rx="15" ry="10" fill="#efe3d4" />
      <g className="labubu-eyes">
        <ellipse cx="24.5" cy="34" rx="4.2" ry="5" fill="#1d1d1d" />
        <ellipse cx="39.5" cy="34" rx="4.2" ry="5" fill="#1d1d1d" />
        <circle cx="25.8" cy="32.2" r="1.4" fill="#fff" />
        <circle cx="40.8" cy="32.2" r="1.4" fill="#fff" />
      </g>
      <circle cx="18.5" cy="40" r="2.4" fill="#f2b8bf" opacity="0.8" />
      <circle cx="45.5" cy="40" r="2.4" fill="#f2b8bf" opacity="0.8" />
      <path d="M22 41 Q32 49 42 41 Q32 46 22 41Z" fill="#5a2d2d" />
      <path d="M23.5 41.8 l1.6 2.6 l1.6 -1.9 l1.6 2.6 l1.6 -2 l1.6 2.7 l1.6 -2 l1.6 2.6 l1.6 -2 l1.6 2.4 l1.4 -2.6"
        fill="#fff" stroke="#fff" strokeWidth="0.6" strokeLinejoin="round" />
      {/* waving arm, pivots at the shoulder */}
      <g className="labubu-arm">
        <path d="M45 53 C52 52 57 47 58.5 41" fill="none" stroke="#8a7462" strokeWidth="6.4" strokeLinecap="round" />
        <path d="M45 53 C52 52 57 47 58.5 41" fill="none" stroke="#c8b6a4" strokeWidth="4.6" strokeLinecap="round" />
        <circle cx="59" cy="39" r="4" fill="#c8b6a4" stroke="#8a7462" strokeWidth="1" />
        <path d="M57.2 35.6 v2 M59 35.2 v2.2 M60.8 35.6 v2" stroke="#8a7462" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    </g>
  )
}

/** The header logo: Labubu Carl, who waves when you hover over it (as in assignment 4). */
export function LabubuCarlLogo() {
  return (
    <a className="labubu-logo" href="#top" title="Design by Labubu Carl" aria-label="Campus Customs desk, design by Labubu Carl">
      <svg width="46" height="58" viewBox="0 0 64 80" aria-hidden="true" className="labubu">
        <LabubuFigure flower={false} />
      </svg>
      <span className="logo-credit">by Labubu Carl</span>
    </a>
  )
}

type Phase = 'away' | 'walk-in' | 'peek' | 'walk-out'

const START_X = -140
const PEEK_X = 520 // stands under the middle of the window
const END_X = 1340
const SPEED = 95 // scene px per second
const SCALE = 1.55
const FEET_Y = 706
const PEEK_LIFT = 44 // she hops up onto the blue crate under the window to see in
export const PEEK_CRATE_X = PEEK_X + 50 // crate centre, drawn by the storefront

/** Every 35-60 s Labubu strolls past, stops to look in the window, then continues. */
export function WalkingLabubu({ onPeek }: { onPeek: (peeking: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('away')
  const [waving, setWaving] = useState(false)
  const g = useRef<SVGGElement>(null)
  const x = useRef(START_X)
  const peekRef = useRef(onPeek)
  peekRef.current = onPeek

  // schedule the next stroll
  useEffect(() => {
    if (phase !== 'away') return
    const first = x.current === START_X && !g.current?.dataset.walked
    const wait = first ? 7000 : 35000 + Math.random() * 25000
    const t = window.setTimeout(() => {
      x.current = START_X
      if (g.current) g.current.dataset.walked = '1'
      setPhase('walk-in')
    }, wait)
    return () => window.clearTimeout(t)
  }, [phase])

  // move her along the sidewalk
  useEffect(() => {
    if (phase !== 'walk-in' && phase !== 'walk-out') return
    let raf = 0
    let last = performance.now()
    const target = phase === 'walk-in' ? PEEK_X : END_X
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      x.current = Math.min(target, x.current + SPEED * dt)
      const bob = Math.abs(Math.sin(now / 120)) * -4
      g.current?.setAttribute('transform', `translate(${x.current} ${FEET_Y - 80 * SCALE + bob}) scale(${SCALE})`)
      if (x.current >= target) {
        if (phase === 'walk-in') setPhase('peek')
        else setPhase('away')
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // peek: rise on tiptoe, look inside, wave at the team, then walk on
  useEffect(() => {
    if (phase !== 'peek') return
    g.current?.setAttribute('transform', `translate(${x.current} ${FEET_Y - PEEK_LIFT - 80 * SCALE}) scale(${SCALE})`)
    peekRef.current(true)
    const w1 = window.setTimeout(() => setWaving(true), 1600)
    const w2 = window.setTimeout(() => setWaving(false), 3600)
    const done = window.setTimeout(() => {
      peekRef.current(false)
      setPhase('walk-out')
    }, 5200)
    return () => [w1, w2, done].forEach(window.clearTimeout)
  }, [phase])

  if (phase === 'away') return null
  return (
    <g ref={g} className={`walking-labubu phase-${phase}${waving ? ' waving' : ''}`}
      transform={`translate(${x.current} ${FEET_Y - 80 * SCALE}) scale(${SCALE})`}>
      <ellipse cx="32" cy="80" rx="20" ry="3.5" fill="#000" opacity="0.12" />
      <LabubuFigure walking={phase !== 'peek'} />
      {phase === 'peek' && (
        <g className="peek-heart">
          <path d="M32 -6 c-3 -5 -10 -3 -9 2 c1 4 9 8 9 8 s8 -4 9 -8 c1 -5 -6 -7 -9 -2z" fill="#ff6f9c" />
        </g>
      )}
    </g>
  )
}
