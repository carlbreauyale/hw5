// How each agent looks and where it sits in the shop (scene coordinates, viewBox 1200 x 760).
import type { AgentKey } from './types'

export interface AgentMeta {
  key: AgentKey
  name: string
  title: string // their position on the team
  color: string // shirt / accent colour, reused for their letters and log lines
  skin: string
  hair: string
  x: number // seat centre inside the window
  blurb: string
}

export const AGENTS: Record<AgentKey, AgentMeta> = {
  customer_service: {
    key: 'customer_service', name: 'Cece', title: 'Customer Service', color: '#d6456b', skin: '#f1c7a5', hair: '#3b2416',
    x: 250, blurb: 'Writes the replies. Drafts only; a human sends them.',
  },
  inventory: {
    key: 'inventory', name: 'Ivan', title: 'Inventory', color: '#2f8f5b', skin: '#c68a5e', hair: '#1f1a17',
    x: 405, blurb: 'Counts the shelves, finds shortfalls and the restock vendor.',
  },
  boss: {
    key: 'boss', name: 'Bea', title: 'The Boss', color: '#00356b', skin: '#8d5a3b', hair: '#d9d4cc',
    x: 560, blurb: 'Reads every ticket, hands out the work, makes the final call.',
  },
  accounting: {
    key: 'accounting', name: 'Abe', title: 'Accounting', color: '#7b4fc2', skin: '#f3d3b6', hair: '#a8552d',
    x: 715, blurb: 'Watches cash and invoices; files payments for your OK.',
  },
  facilities: {
    key: 'facilities', name: 'Fay', title: 'Facilities', color: '#d9822b', skin: '#e0ac7e', hair: '#5a3a22',
    x: 870, blurb: 'Knows the lease: rent, due dates, the landlord.',
  },
}

export const AGENT_ORDER: AgentKey[] = ['boss', 'inventory', 'accounting', 'facilities', 'customer_service']
export const SEAT_ORDER: AgentKey[] = ['customer_service', 'inventory', 'boss', 'accounting', 'facilities']

export const isAgent = (k: string | null | undefined): k is AgentKey => !!k && k in AGENTS

// Friendly words for each MCP tool, used in speech bubbles, chips and the log.
export const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  list_open_tickets: { icon: '🗃️', label: 'scanning the ticket board' },
  get_ticket: { icon: '📋', label: 'reading the ticket' },
  check_stock: { icon: '📦', label: 'checking the shelves' },
  list_vendors: { icon: '🚚', label: 'looking up vendors' },
  check_vendor_invoices: { icon: '🧾', label: 'checking vendor bills' },
  get_lease_rent_status: { icon: '🏠', label: 'reading the lease' },
  get_cash_position: { icon: '💵', label: 'counting the cash' },
  check_price_margin: { icon: '📈', label: 'running the margins' },
  quote_restock: { icon: '💲', label: 'pricing a restock' },
  list_board: { icon: '📌', label: 'checking the board' },
  request_payment: { icon: '✍️', label: 'filing a payment for your OK' },
  request_purchase_order: { icon: '🛒', label: 'filing a purchase order for your OK' },
  draft_message: { icon: '✉️', label: 'drafting a message' },
  update_ticket: { icon: '🗂️', label: 'updating the ticket' },
  withdraw_request: { icon: '↩️', label: 'withdrawing a request' },
  delegate: { icon: '📨', label: 'handing off work' },
}

export const toolLabel = (t: string) => TOOL_LABELS[t] ?? { icon: '🔧', label: t.replaceAll('_', ' ') }

export const TICKET_ICONS: Record<string, string> = {
  customer_order: '👕',
  rent_notice: '🏠',
  price_override: '🏷️',
}

export const STATUS_WORDS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_approval: 'Waiting on your OK',
  blocked: 'Blocked',
  resolved: 'Resolved',
}
