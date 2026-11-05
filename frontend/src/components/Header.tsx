// Top bar: Labubu Carl logo (waves on hover), the shop name and day, the backend status,
// the checking balance as a register display (counts down with a red "−$" when a payment
// is approved), and the reset button.
import { useEffect, useRef, useState } from 'react'
import { money } from '../api'
import type { Cash } from '../types'
import { LabubuCarlLogo } from './scene/Labubu'

function CashDisplay({ cash }: { cash: Cash | null }) {
  const [shown, setShown] = useState<number | null>(cash?.balance ?? null)
  const [delta, setDelta] = useState<{ amount: number; id: number } | null>(null)
  const prev = useRef<number | null>(cash?.balance ?? null)

  useEffect(() => {
    const target = cash?.balance ?? null
    const from = prev.current
    prev.current = target
    if (target === null) return setShown(null)
    if (from === null || from === target) return setShown(target)
    setDelta({ amount: target - from, id: Date.now() })
    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 1400)
      const e = 1 - Math.pow(1 - t, 3)
      setShown(from + (target - from) * e)
      if (t < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [cash?.balance])

  return (
    <div className={`register-display${delta && delta.amount < 0 ? ' ka-ching' : ''}`} key={delta?.id ?? 0}>
      <div className="register-label">Checking</div>
      <div className="register-lcd" aria-live="polite">{money(shown)}</div>
      {cash && (
        <div className="register-foot">
          <span title="Requests filed by the team, waiting for your approval">pending {money(cash.pending_total)}</span>
          <span title="What is left after pending requests and the $100 reserve">spendable {money(cash.spendable_after_pending)}</span>
        </div>
      )}
      {delta && delta.amount !== 0 && (
        <div key={delta.id} className={`register-delta ${delta.amount < 0 ? 'down' : 'up'}`}>
          {delta.amount < 0 ? '−' : '+'}
          {money(Math.abs(delta.amount))}
        </div>
      )}
    </div>
  )
}

export default function Header({
  cash,
  shopToday,
  online,
  model,
  busy,
  onReset,
}: {
  cash: Cash | null
  shopToday: string | null
  online: boolean
  model: string | null
  busy: boolean
  onReset: () => void
}) {
  const day = shopToday ? new Date(`${shopToday}T12:00:00`) : null
  return (
    <header className="topbar" id="top">
      <div className="brand">
        <LabubuCarlLogo />
        <div>
          <h1>
            Campus Customs <span className="brand-sub">Agent Desk</span>
          </h1>
          <div className="brand-line">
            <span className="chip day-chip" title="desk.date_today: the shop's today">
              🌷 Shop day: {day ? day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '…'}
            </span>
            <span className={`chip status-chip ${online ? 'ok' : 'down'}`} title={online ? `Backend at localhost:8000 · ${model ?? ''}` : 'Start the backend: uvicorn main:app --reload --port 8000'}>
              <span className="dot" /> {online ? `Team online · ${model ?? ''}` : 'Backend offline'}
            </span>
          </div>
        </div>
      </div>
      <div className="topbar-right">
        <CashDisplay cash={cash} />
        <button className="btn ghost" onClick={onReset} disabled={busy || !online} title="Copy the original database over the working copy (the audit trail is kept)">
          ↺ Reset shop
        </button>
      </div>
    </header>
  )
}
