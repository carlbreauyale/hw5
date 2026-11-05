// Thin client for the FastAPI backend. The dashboard talks to it directly at http://localhost:8000
// (override with VITE_API_BASE); the backend allows this page's origin through CORS.
import type { ApprovalRequest, AgentEvent, Board, Cash, Health, RunStatus, Summary, Ticket } from './types'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail ?? body
    let message = `${res.status} ${res.statusText}`
    if (detail && typeof detail === 'object' && 'error' in detail) message = String((detail as { error: unknown }).error)
    else if (Array.isArray(detail)) message = detail.map((d: { msg?: string }) => d.msg).join('; ')
    throw new ApiError(res.status, message, detail)
  }
  return body as T
}

export const api = {
  health: () => call<Health>('/api/health'),
  tickets: () => call<{ shop_today: string; tickets: Ticket[] }>('/api/tickets'),
  summary: (ticketId: number) => call<Summary>(`/api/tickets/${ticketId}/summary`),
  run: (ticketId: number) => call<RunStatus>(`/api/tickets/${ticketId}/run`, { method: 'POST' }),
  runStatus: (traceId: string) => call<RunStatus>(`/api/runs/${traceId}`),
  events: (params: { trace_id?: string; after_seq?: number; limit?: number }) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) q.set(k, String(v))
    })
    return call<{ total_in_file: number; last_seq: number; events: AgentEvent[] }>(`/api/events?${q}`)
  },
  approvals: (status = 'pending') => call<{ requests: ApprovalRequest[] }>(`/api/approvals?status=${status}`),
  approve: (id: number, approver: string, note = '') =>
    call<{ result: Record<string, unknown>; cash: Partial<Cash> }>(`/api/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver, note }),
    }),
  reject: (id: number, approver: string, note = '') =>
    call<{ result: Record<string, unknown> }>(`/api/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approver, note }),
    }),
  board: (ticketId?: number) => call<Board>(`/api/board${ticketId !== undefined ? `?ticket_id=${ticketId}` : ''}`),
  cash: () => call<Cash>('/api/cash'),
  reset: () => call<{ ok: boolean; message: string; balance: number }>('/api/reset', { method: 'POST' }),
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
