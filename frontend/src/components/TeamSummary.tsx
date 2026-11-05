// "What the team did" on the selected ticket: the Boss's final call up top, then one line per
// agent (what they reported, the tools they used, who they handed work to), then the message
// drafts waiting for a human to send.
import { AGENTS, STATUS_WORDS, isAgent, toolLabel } from '../agents'
import type { Draft, Summary } from '../types'

function Avatar({ k }: { k: string }) {
  const a = isAgent(k) ? AGENTS[k] : null
  return (
    <span className="avatar" style={{ background: a?.color ?? '#888' }} aria-hidden="true">
      {a ? a.name[0] : '?'}
    </span>
  )
}

export default function TeamSummary({
  summary,
  drafts,
  ticketId,
  running,
}: {
  summary: Summary | null
  drafts: Draft[]
  ticketId: number | null
  running: boolean
}) {
  if (ticketId === null) return null
  const outcome = summary?.outcome
  return (
    <section className="card summary-card">
      <div className="card-head">
        <h2>What the team did on #{ticketId}</h2>
        {summary?.usage?.total_tokens && (
          <span className="muted small" title="Model calls and tokens for this run">
            {summary.usage.requests} calls · {(summary.usage.total_tokens / 1000).toFixed(0)}k tokens
          </span>
        )}
      </div>

      {!summary?.trace_id && !running && <p className="empty">Not worked yet. Send it to the team and watch the window.</p>}
      {running && !summary?.finished && <p className="empty pulse">The team is working on it right now; the summary fills in when they finish.</p>}

      {outcome && (
        <div className="verdict">
          <div className="verdict-head">
            <Avatar k="boss" />
            <div>
              <strong>Bea's call</strong>
              <span className="pill pill-status">{STATUS_WORDS[outcome.final_status] ?? outcome.final_status}</span>
            </div>
          </div>
          <p className="verdict-text">{outcome.decision}</p>
          {outcome.waiting_on_human?.length > 0 && (
            <ul className="todo">
              {outcome.waiting_on_human.map((w, i) => (
                <li key={i}>☐ {w}</li>
              ))}
            </ul>
          )}
          {outcome.alternatives_approved?.length > 0 && (
            <p className="muted small">Alternatives Bea approved: {outcome.alternatives_approved.join(' · ')}</p>
          )}
        </div>
      )}

      {summary && summary.agents.length > 0 && (
        <ul className="agent-lines">
          {summary.agents.map((s) => {
            const a = AGENTS[s.agent]
            return (
              <li key={s.agent} style={{ borderLeftColor: a?.color }}>
                <div className="agent-line-head">
                  <Avatar k={s.agent} />
                  <strong>{a?.name}</strong>
                  <span className="muted small">{a?.title}</span>
                  {s.delegated_to.length > 0 && (
                    <span className="handoffs small">
                      → {s.delegated_to.filter(isAgent).map((k) => AGENTS[k].name).join(', ')}
                    </span>
                  )}
                </div>
                {s.summary && <p className="agent-line-text">{s.summary}</p>}
                <div className="tool-chips">
                  {Object.entries(s.tools_used).map(([t, n]) => (
                    <span key={t} className="tool-chip-pill" title={t}>
                      {toolLabel(t).icon} {t}
                      {n > 1 ? ` ×${n}` : ''}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {drafts.length > 0 && (
        <div className="drafts">
          <h3>Drafts waiting for you to send</h3>
          {drafts.map((d) => (
            <article key={d.id} className="draft">
              <div className="draft-head">
                <span>To: <strong>{d.recipient}</strong></span>
                <span className="muted small">draft #{d.id} · by {isAgent(d.drafted_by) ? AGENTS[d.drafted_by].name : d.drafted_by}</span>
              </div>
              <div className="draft-subject">{d.subject}</div>
              <p className="draft-body">{d.body}</p>
              <button className="btn tiny ghost" onClick={() => navigator.clipboard?.writeText(`${d.subject}\n\n${d.body}`)}>
                Copy text
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
