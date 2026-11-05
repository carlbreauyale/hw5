// The desk log under the window: a running transcript of who said what to whom, which tools
// they used, and when the ticket was resolved. Colour-coded by agent; follows the latest line.
import { useEffect, useRef } from 'react'
import { AGENTS, isAgent, toolLabel } from '../agents'
import type { LogEntry } from '../usePlayback'

const KIND_ICON: Record<LogEntry['kind'], string> = {
  handoff: '📨',
  report: '📁',
  tool: '🔧',
  say: '💬',
  think: '💭',
  system: '🛎️',
  warn: '⚠️',
  done: '✅',
}

function who(k: string | null | undefined) {
  if (!k) return 'Shop'
  return isAgent(k) ? AGENTS[k].name : k
}

export default function DeskLog({ log, backlog, live }: { log: LogEntry[]; backlog: number; live: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // follow the newest line inside the log box only (never scroll the whole page)
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [log.length])

  return (
    <section className="card log-card">
      <div className="card-head">
        <h2>Desk log {live && <span className="live-dot" title="Live" />}</h2>
        <span className="muted small">{backlog > 3 ? `catching up · ${backlog} queued` : 'what each agent said and did'}</span>
      </div>
      <div className="log-scroll" role="log" aria-live="polite" ref={box}>
        {log.length === 0 && <p className="empty">Quiet at the desk. Pick a ticket and send it to the team.</p>}
        {log.map((e) => {
          const color = isAgent(e.agent) ? AGENTS[e.agent].color : '#7a7a7a'
          return (
            <div key={e.id} className={`log-line kind-${e.kind}`} style={{ borderLeftColor: color }}>
              <span className="log-time">{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="log-icon" aria-hidden="true">{KIND_ICON[e.kind]}</span>
              <span className="log-text">
                <strong style={{ color }}>{who(e.agent)}</strong>
                {e.to && (
                  <>
                    {' → '}
                    <strong style={{ color: isAgent(e.to) ? AGENTS[e.to].color : undefined }}>{who(e.to)}</strong>
                  </>
                )}
                {e.kind === 'tool' && e.tools ? (
                  <span> {e.tools.map((t) => `${toolLabel(t).icon} ${t}`).join('  ')}</span>
                ) : (
                  <span>: {e.text}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
