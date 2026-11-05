// The Campus Customs agent desk. Left: the interaction table (tickets, approvals, what the
// team did). Right: the shop window where the agents work, and the desk log underneath.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, money } from './api'
import ApprovalTray from './components/ApprovalTray'
import DeskLog from './components/DeskLog'
import Header from './components/Header'
import TeamSummary from './components/TeamSummary'
import TicketTable from './components/TicketTable'
import StoreScene from './components/scene/StoreScene'
import type { ApprovalRequest, Cash, Draft, Summary, Ticket } from './types'
import { usePlayback, type ActiveRun } from './usePlayback'

interface Toast {
  id: number
  kind: 'ok' | 'err' | 'info'
  text: string
}

const REFRESH_MS = 4000

function useStoredState(key: string, initial: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  const set = (next: string) => {
    setV(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      /* private mode */
    }
  }
  return [v, set]
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [shopToday, setShopToday] = useState<string | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [online, setOnline] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [approver, setApprover] = useStoredState('campus-customs:approver', '')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [freshStamp, setFreshStamp] = useState<number | null>(null)
  const [paying, setPaying] = useState(false)
  const followedTrace = useRef<string | null>(null)
  const liveRef = useRef(false)
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selectedId

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const t = { id: Date.now() + Math.random(), kind, text }
    setToasts((prev) => [...prev.slice(-3), t])
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 6500)
  }, [])

  // ---------------------------------------------------------------- data
  const refreshAll = useCallback(async () => {
    const [t, c, a] = await Promise.allSettled([api.tickets(), api.cash(), api.approvals('pending')])
    if (t.status === 'fulfilled') {
      setTickets(t.value.tickets)
      setShopToday(t.value.shop_today)
      setSelectedId((cur) => cur ?? t.value.tickets[0]?.id ?? null)
    }
    if (c.status === 'fulfilled') setCash(c.value)
    if (a.status === 'fulfilled') setRequests(a.value.requests)
    setOnline(t.status === 'fulfilled')
  }, [])

  const refreshTicket = useCallback(async (id: number | null) => {
    if (id === null) return
    const [s, b] = await Promise.allSettled([api.summary(id), api.board(id)])
    if (selectedRef.current !== id) return
    setSummary(s.status === 'fulfilled' ? s.value : null)
    setDrafts(b.status === 'fulfilled' ? b.value.drafts : [])
  }, [])

  const onFinished = useCallback(
    (run: ActiveRun) => {
      refreshAll()
      refreshTicket(run.ticketId)
      if (run.mode === 'live') {
        setFreshStamp(run.ticketId)
        toast('ok', `Ticket #${run.ticketId} is resolved. See what each agent did on the left.`)
        window.setTimeout(() => setFreshStamp(null), 2500)
      }
    },
    [refreshAll, refreshTicket, toast],
  )

  const play = usePlayback(onFinished)
  const running = play.active?.mode === 'live'
  const busy = !!play.active
  liveRef.current = running

  // poll the board; on first contact, pick up a run that is already in progress
  useEffect(() => {
    refreshAll()
    const t = window.setInterval(refreshAll, REFRESH_MS)
    return () => window.clearInterval(t)
  }, [refreshAll])

  useEffect(() => {
    const check = async () => {
      try {
        const h = await api.health()
        setOnline(true)
        setModel(h.model)
        // Follow any team run the backend is doing, even one started from another tab or the
        // command line, so the window always shows what the team is working on.
        const r = h.run_in_progress
        if (r && r.trace_id !== followedTrace.current && !liveRef.current) {
          followedTrace.current = r.trace_id
          setSelectedId(r.ticket_id)
          play.attach(r.trace_id, r.ticket_id)
          toast('info', `The team picked up ticket #${r.ticket_id}. Watch the window.`)
        }
      } catch {
        setOnline(false)
      }
    }
    check()
    const t = window.setInterval(check, 3000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSummary(null)
    setDrafts([])
    refreshTicket(selectedId)
  }, [selectedId, refreshTicket])

  // ---------------------------------------------------------------- actions
  const onRun = async (id: number) => {
    try {
      const r = await api.run(id)
      followedTrace.current = r.trace_id
      setSelectedId(id)
      play.attach(r.trace_id, id)
      toast('info', `Ticket #${id} handed to the team. Watch the window.`)
      refreshAll()
    } catch (e) {
      toast('err', e instanceof ApiError ? e.message : 'Could not reach the backend.')
    }
  }

  const onReplay = async (t: Ticket) => {
    if (!t.last_run) return
    try {
      await play.replay(t.last_run.trace_id, t.id)
    } catch {
      toast('err', 'Could not load that run.')
    }
  }

  const onDecide = async (r: ApprovalRequest, decision: 'approve' | 'reject') => {
    try {
      if (decision === 'approve') {
        const res = await api.approve(r.id, approver.trim())
        setPaying(true)
        window.setTimeout(() => setPaying(false), 1800)
        toast('ok', `Paid ${money(r.amount)}, approved by ${approver.trim()}. Checking is now ${money(res.cash.balance)}.`)
        play.addLog({ time: new Date().toISOString(), agent: null, kind: 'done', ticketId: r.ticket_id,
          text: `${approver.trim()} approved request #${r.id}: ${money(r.amount)} paid.` })
      } else {
        await api.reject(r.id, approver.trim())
        toast('info', `Request #${r.id} rejected. No money moved.`)
      }
    } catch (e) {
      toast('err', e instanceof ApiError ? e.message : 'Could not reach the backend.')
    } finally {
      await refreshAll()
      refreshTicket(selectedRef.current)
    }
  }

  const onReset = async () => {
    if (!window.confirm('Reset the shop to the original data? Payments, drafts and ticket updates are cleared (the audit trail is kept).')) return
    try {
      const r = await api.reset()
      play.clearScene()
      toast('ok', `Shop reset. Checking is back to ${money(r.balance)}.`)
    } catch (e) {
      toast('err', e instanceof ApiError ? e.message : 'Reset failed.')
    }
    await refreshAll()
    refreshTicket(selectedRef.current)
  }

  // ---------------------------------------------------------------- view
  const sceneTicketId = play.active?.ticketId ?? selectedId
  const sceneTicket = tickets.find((t) => t.id === sceneTicketId) ?? null
  const stamped = !!sceneTicket && (play.stamp?.ticketId === sceneTicket.id || (!busy && sceneTicket.state === 'resolved'))

  return (
    <div className="app">
      <Header cash={cash} shopToday={shopToday} online={online} model={model} busy={busy} onReset={onReset} />
      <main className="desk">
        <aside className="panel" aria-label="Interaction table">
          <TicketTable tickets={tickets} selectedId={selectedId} runningId={running ? (play.active?.ticketId ?? null) : null}
            busy={busy} freshStampId={freshStamp} onSelect={setSelectedId} onRun={onRun} onReplay={onReplay} />
          <ApprovalTray requests={requests} cash={cash} approver={approver} setApprover={setApprover} onDecide={onDecide} focusTicket={selectedId} />
          <TeamSummary summary={summary} drafts={drafts} ticketId={selectedId} running={running && play.active?.ticketId === selectedId} />
        </aside>

        <section className="stage" aria-label="The shop">
          <div className={`scene-frame${paying ? ' paid' : ''}`}>
            <StoreScene agents={play.agents} letters={play.letters} cash={cash?.balance ?? null} ticket={sceneTicket}
              running={running} stamped={stamped} shopToday={shopToday} />
            {play.active?.mode === 'replay' && <div className="replay-tag">⟲ Replay of #{play.active.ticketId}</div>}
            {!online && (
              <div className="offline">
                <strong>The backend is not answering.</strong>
                <span>From backend/: <code>uvicorn main:app --reload --port 8000</code></span>
              </div>
            )}
          </div>
          <DeskLog log={play.log} backlog={play.backlog} live={running} />
        </section>
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}
