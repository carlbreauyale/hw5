// The interaction table: the three tickets as cards, the selected ticket's docket, and the
// button that sends it to the team. A finished ticket gets a red RESOLVED stamp.
import { STATUS_WORDS, TICKET_ICONS } from '../agents'
import type { Ticket } from '../types'

const TYPE_WORDS: Record<string, string> = {
  customer_order: 'Customer order',
  rent_notice: 'Rent notice',
  price_override: 'Price override',
}

function StatePill({ t, running }: { t: Ticket; running: boolean }) {
  if (running) return <span className="pill pill-running">Team working…</span>
  if (t.state === 'resolved') return <span className="pill pill-resolved">Resolved</span>
  return <span className="pill pill-open">Open</span>
}

function details(t: Ticket): string {
  if (t.sku) return `${t.qty ?? 1} × ${t.sku} · size ${t.size}`
  if (t.lease_id) return `Lease #${t.lease_id}`
  if (t.invoice_id) return `Invoice #${t.invoice_id}`
  return ''
}

export default function TicketTable({
  tickets,
  selectedId,
  runningId,
  busy,
  freshStampId,
  onSelect,
  onRun,
  onReplay,
}: {
  tickets: Ticket[]
  selectedId: number | null
  runningId: number | null
  busy: boolean
  freshStampId: number | null
  onSelect: (id: number) => void
  onRun: (id: number) => void
  onReplay: (t: Ticket) => void
}) {
  const selected = tickets.find((t) => t.id === selectedId) ?? null
  return (
    <section className="card tickets-card">
      <div className="card-head">
        <h2>Ticket board</h2>
        <span className="muted">{tickets.filter((t) => t.state !== 'resolved').length} open · {tickets.length} total</span>
      </div>
      <ul className="ticket-list" role="listbox" aria-label="Tickets">
        {tickets.map((t) => {
          const running = runningId === t.id
          return (
            <li key={t.id}>
              <button
                role="option"
                aria-selected={t.id === selectedId}
                className={`ticket ${t.id === selectedId ? 'selected' : ''} state-${running ? 'running' : t.state}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="ticket-icon" aria-hidden="true">{TICKET_ICONS[t.type] ?? '📄'}</span>
                <span className="ticket-main">
                  <span className="ticket-top">
                    <strong>#{t.id}</strong> {t.subject}
                  </span>
                  <span className="ticket-meta">
                    {TYPE_WORDS[t.type] ?? t.type} · {t.requester}
                  </span>
                  <span className="ticket-status">
                    <StatePill t={t} running={running} />
                    {t.status !== 'open' && !running && <span className="muted small">{STATUS_WORDS[t.status] ?? t.status}</span>}
                    {t.pending_approvals > 0 && <span className="pill pill-ask">✍️ {t.pending_approvals} to approve</span>}
                    {t.drafts > 0 && <span className="pill pill-draft">✉️ {t.drafts} draft</span>}
                  </span>
                </span>
                {t.state === 'resolved' && !running && (
                  <span className={`ticket-stamp${freshStampId === t.id ? ' fresh' : ''}`} aria-hidden="true">RESOLVED</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <div className="docket">
          <div className="docket-row">
            <span className="docket-label">From</span>
            <span>{selected.requester}</span>
          </div>
          {details(selected) && (
            <div className="docket-row">
              <span className="docket-label">Asks for</span>
              <span>{details(selected)}</span>
            </div>
          )}
          {selected.notes && <blockquote className="docket-note">“{selected.notes}”</blockquote>}
          <div className="docket-actions">
            <button className="btn primary" disabled={busy} onClick={() => onRun(selected.id)}>
              {runningId === selected.id ? 'The team is on it…' : selected.state === 'resolved' ? `Run the team on #${selected.id} again` : `Send #${selected.id} to the team ▶`}
            </button>
            {selected.last_run && (
              <button className="btn ghost" disabled={busy} onClick={() => onReplay(selected)} title="Watch the team's last run again">
                ⟲ Replay
              </button>
            )}
          </div>
          {busy && runningId !== null && runningId !== selected.id && (
            <p className="muted small">One ticket at a time: the team is busy with #{runningId}.</p>
          )}
          {busy && runningId === null && <p className="muted small">A replay is playing in the window.</p>}
        </div>
      )}
    </section>
  )
}
