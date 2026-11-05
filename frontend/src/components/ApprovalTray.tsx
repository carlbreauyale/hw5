// "Needs your OK": the payment and purchase-order requests the agents prepared. The agents can
// only file these; clicking Approve is what actually pays (POST /api/approvals/{id}/approve).
import { useState } from 'react'
import { AGENTS, isAgent } from '../agents'
import { money } from '../api'
import type { ApprovalRequest, Cash } from '../types'

const KIND: Record<string, { icon: string; word: string }> = {
  invoice: { icon: '🧾', word: 'Pay vendor invoice' },
  rent: { icon: '🏠', word: 'Pay rent' },
  purchase_order: { icon: '🛒', word: 'Purchase order' },
}

function title(r: ApprovalRequest) {
  const k = KIND[r.request_type] ?? { icon: '💳', word: r.request_type }
  if (r.request_type === 'invoice') return `${k.word} #${r.ref_id}`
  if (r.request_type === 'rent') return `${k.word} · lease #${r.ref_id}`
  return `${k.word}: ${r.qty} × ${r.sku} ${r.size}`
}

export default function ApprovalTray({
  requests,
  cash,
  approver,
  setApprover,
  onDecide,
  focusTicket,
}: {
  requests: ApprovalRequest[]
  cash: Cash | null
  approver: string
  setApprover: (s: string) => void
  onDecide: (r: ApprovalRequest, decision: 'approve' | 'reject') => Promise<void>
  focusTicket: number | null
}) {
  const [working, setWorking] = useState<number | null>(null)
  const decide = async (r: ApprovalRequest, d: 'approve' | 'reject') => {
    setWorking(r.id)
    try {
      await onDecide(r, d)
    } finally {
      setWorking(null)
    }
  }
  const sorted = [...requests].sort((a, b) => Number(b.ticket_id === focusTicket) - Number(a.ticket_id === focusTicket) || a.id - b.id)

  return (
    <section className={`card approvals-card${requests.length ? ' has-asks' : ''}`}>
      <div className="card-head">
        <h2>Needs your OK {requests.length > 0 && <span className="count-badge">{requests.length}</span>}</h2>
        <label className="signer">
          <span>Signing as</span>
          <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Your name" aria-label="Your name (approver)" />
        </label>
      </div>
      {requests.length === 0 ? (
        <p className="empty">Nothing to sign. When the team needs money to move, Accounting slides the request here.</p>
      ) : (
        <ul className="ask-list">
          {sorted.map((r) => {
            const k = KIND[r.request_type] ?? { icon: '💳', word: r.request_type }
            const over = cash ? r.amount > cash.balance - cash.min_cash_reserve : false
            const by = isAgent(r.requested_by) ? AGENTS[r.requested_by] : null
            return (
              <li key={r.id} className={`ask${r.ticket_id === focusTicket ? ' focus' : ''}`}>
                <div className="ask-top">
                  <span className="ask-icon" aria-hidden="true">{k.icon}</span>
                  <div className="ask-title">
                    <strong>{title(r)}</strong>
                    <span className="muted small">
                      Request #{r.id} · ticket #{r.ticket_id} · filed by{' '}
                      <span style={{ color: by?.color }}>{by ? `${by.name} (${by.title})` : r.requested_by}</span>
                    </span>
                  </div>
                  <span className="ask-amount">{money(r.amount)}</span>
                </div>
                <p className="ask-reason">{r.reason}</p>
                {over && <p className="ask-warn">This would dip under the $100 reserve; the register will refuse it.</p>}
                <div className="ask-actions">
                  <button className="btn approve" disabled={!approver.trim() || working !== null} onClick={() => decide(r, 'approve')}>
                    {working === r.id ? 'Paying…' : `Approve & pay ${money(r.amount)}`}
                  </button>
                  <button className="btn reject" disabled={!approver.trim() || working !== null} onClick={() => decide(r, 'reject')}>
                    Reject
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!approver.trim() && requests.length > 0 && <p className="muted small">Type your name above to sign. Agents can never approve.</p>}
    </section>
  )
}
