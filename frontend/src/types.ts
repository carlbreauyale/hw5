// Shapes returned by the FastAPI backend (backend/main.py).

export type AgentKey = 'boss' | 'inventory' | 'accounting' | 'facilities' | 'customer_service'

export interface LastRun {
  trace_id: string
  finished_at: string
  ok: boolean
  final_status: string | null
  decision: string | null
}

export interface Ticket {
  id: number
  type: string
  requester: string
  subject: string
  sku: string | null
  size: string | null
  qty: number | null
  lease_id: number | null
  invoice_id: number | null
  status: string // the Boss's detailed status: open | in_progress | waiting_on_approval | blocked | resolved
  notes: string | null
  created_at: string
  state: 'open' | 'running' | 'resolved'
  last_run: LastRun | null
  pending_approvals: number
  drafts: number
}

export interface AgentEvent {
  seq: number
  time: string
  event: string
  agent: string | null
  ticket_id: number | null
  trace_id: string | null
  run_id: string | null
  depth: number | null
  step: number | null
  said?: string | null
  thinking?: string | null
  tools_used?: string[]
  tool_calls?: { tool: string; args: Record<string, unknown> | null }[]
  delegated_to?: string[]
  delegated_by?: string | null
  final_report?: Record<string, unknown> | null
  results?: { tool: string; ok: boolean; result: unknown }[]
  status?: string
  seconds?: number
  usage?: Record<string, number>
  details?: Record<string, unknown>
}

export interface ApprovalRequest {
  id: number
  ticket_id: number | null
  request_type: 'invoice' | 'rent' | 'purchase_order'
  ref_id: number | null
  vendor_id: number | null
  sku: string | null
  size: string | null
  qty: number | null
  amount: number
  account: string
  reason: string
  requested_by: string
  requested_at: string
  status: string
  decided_by: string | null
}

export interface Payment {
  id: number
  kind: string
  ref_id: number | null
  amount: number
  paid_at: string
  approved_by: string
}

export interface Cash {
  account: string
  balance: number
  balance_as_of: string
  pending_total: number
  balance_after_all_pending: number
  min_cash_reserve: number
  spendable_after_pending: number
  payments_made: Payment[]
}

export interface AgentSummary {
  agent: AgentKey
  runs: number
  steps: number
  tools_used: Record<string, number>
  delegated_to: string[]
  delegated_by: string[]
  summary: string | null
  status: string | null
}

export interface TicketOutcome {
  ticket_id: number
  final_status: string
  decision: string
  rationale: string
  agents_consulted: string[]
  approval_request_ids: number[]
  draft_ids: number[]
  alternatives_approved: string[]
  waiting_on_human: string[]
  next_steps: string[]
}

export interface Summary {
  ticket_id: number
  trace_id: string | null
  finished: boolean
  outcome: TicketOutcome | null
  usage: Record<string, number> | null
  agents: AgentSummary[]
}

export interface Draft {
  id: number
  ticket_id: number
  recipient: string
  recipient_type: string
  subject: string
  body: string
  drafted_by: string
  status: string
}

export interface Board {
  approval_requests: ApprovalRequest[]
  drafts: Draft[]
  ticket_updates: { id: number; ticket_id: number; status: string; note: string; updated_by: string; created_at: string }[]
}

export interface RunStatus {
  trace_id: string
  ticket_id: number
  status: 'running' | 'done' | 'error'
  started_at: string
  seconds: number | null
  result: { ok: boolean; error: string | null; usage: Record<string, number>; outcome: TicketOutcome | null } | null
}

export interface Health {
  ok: boolean
  model: string
  database: string
  run_in_progress: { trace_id: string; ticket_id: number } | null
}
