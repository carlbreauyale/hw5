// Turns the backend's agent events into what the shop window shows.
//
// While a ticket runs, the hook polls GET /api/events?trace_id=...&after_seq=... and queues new
// events. A player takes them off the queue one at a time at a human pace (faster when a backlog
// builds up), so a burst of events becomes a readable sequence: letters fly between desks,
// speech bubbles appear, agents change mood. The same player replays a finished run.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { AGENTS, SEAT_ORDER, isAgent, toolLabel } from './agents'
import type { AgentEvent, AgentKey } from './types'

export type Mood = 'idle' | 'thinking' | 'working' | 'waiting' | 'done'
export interface Bubble {
  id: number
  kind: 'say' | 'think' | 'tool' | 'warn'
  text: string
}
export interface AgentVisual {
  mood: Mood
  bubble: Bubble | null
  toolIcon: string | null
  toolId: number
}
export type Spot = AgentKey | 'door'
export interface Letter {
  id: number
  from: Spot
  to: Spot
  kind: 'instruction' | 'report' | 'refused'
  color: string
}
export interface LogEntry {
  id: number
  time: string
  agent: string | null
  to?: string | null
  kind: 'handoff' | 'report' | 'tool' | 'say' | 'think' | 'system' | 'warn' | 'done'
  text: string
  tools?: string[]
  ticketId: number | null
}
export interface ActiveRun {
  traceId: string
  ticketId: number
  mode: 'live' | 'replay'
}

const POLL_MS = 1200
const LETTER_MS = 1150

const freshAgents = (): Record<AgentKey, AgentVisual> =>
  Object.fromEntries(SEAT_ORDER.map((k) => [k, { mood: 'idle', bubble: null, toolIcon: null, toolId: 0 }])) as Record<
    AgentKey,
    AgentVisual
  >

const clip = (s: string | null | undefined, n = 150) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

// How long each kind of event stays on screen before the next one plays.
const PACE: Record<string, number> = {
  ticket_run_start: 900,
  agent_run_start: 1300,
  model_step: 1500,
  tool_results: 650,
  agent_run_end: 1500,
  delegation_refused: 1100,
  ticket_run_end: 1600,
}

export function usePlayback(onFinished: (run: ActiveRun) => void) {
  const [agents, setAgents] = useState<Record<AgentKey, AgentVisual>>(freshAgents)
  const [letters, setLetters] = useState<Letter[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [active, setActive] = useState<ActiveRun | null>(null)
  const [stamp, setStamp] = useState<{ ticketId: number; id: number } | null>(null)
  const [backlog, setBacklog] = useState(0)

  const queue = useRef<AgentEvent[]>([])
  const parents = useRef<Record<string, { agent: string; parent: string | null }>>({})
  const nextId = useRef(1)
  const lastSeq = useRef(-1)
  const serverDone = useRef(false)
  const sawEnd = useRef(false)
  const activeRef = useRef<ActiveRun | null>(null)
  const finishedRef = useRef(onFinished)
  finishedRef.current = onFinished
  const idleTimer = useRef<number | undefined>(undefined)

  const id = () => nextId.current++

  const patchAgent = useCallback((key: string | null | undefined, patch: Partial<AgentVisual>) => {
    if (!isAgent(key)) return
    setAgents((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }, [])

  const say = useCallback(
    (key: string | null | undefined, kind: Bubble['kind'], text: string, mood?: Mood) => {
      if (!isAgent(key) || !text) return
      patchAgent(key, { bubble: { id: id(), kind, text: clip(text, kind === 'say' ? 170 : 130) }, ...(mood ? { mood } : {}) })
    },
    [patchAgent],
  )

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    setLog((prev) => [...prev.slice(-250), { ...entry, id: id() }])
  }, [])

  const fly = useCallback((from: Spot, to: Spot, kind: Letter['kind'], color: string) => {
    const letter = { id: id(), from, to, kind, color }
    setLetters((prev) => [...prev, letter])
    window.setTimeout(() => setLetters((prev) => prev.filter((l) => l.id !== letter.id)), LETTER_MS + 100)
  }, [])

  // ------------------------------------------------------------ apply one event to the scene
  const apply = useCallback(
    (e: AgentEvent) => {
      const who = e.agent
      const base = { time: e.time, agent: who, ticketId: e.ticket_id }
      switch (e.event) {
        case 'ticket_run_start': {
          window.clearTimeout(idleTimer.current)
          fly('door', 'boss', 'instruction', '#f6c343')
          addLog({ ...base, agent: null, kind: 'system', text: `Ticket #${e.ticket_id} came in the door and landed on the Boss's desk.` })
          break
        }
        case 'agent_run_start': {
          const parent = e.delegated_by ?? null
          if (e.run_id && who) parents.current[e.run_id] = { agent: who, parent }
          if (isAgent(parent) && isAgent(who)) {
            fly(parent, who, 'instruction', AGENTS[parent].color)
            say(parent, 'say', `→ ${AGENTS[who].name}: ${e.said ?? ''}`, 'waiting')
            say(who, 'think', 'A letter! Let me read it…', 'thinking')
            addLog({ ...base, agent: parent, to: who, kind: 'handoff', text: clip(e.said, 260) })
          } else {
            say(who, 'say', `New ticket #${e.ticket_id}. Let me read it.`, 'thinking')
          }
          break
        }
        case 'model_step': {
          const tools = (e.tools_used ?? []).filter((t) => t !== 'delegate')
          const handoffs = e.delegated_to ?? []
          if (e.thinking) addLog({ ...base, kind: 'think', text: clip(e.thinking, 260) })
          if (e.said) addLog({ ...base, kind: 'say', text: clip(e.said, 260) })
          if (e.final_report) {
            const r = e.final_report as { summary?: string; decision?: string }
            say(who, 'say', r.decision ?? r.summary ?? 'Report ready.', 'done')
          } else if (tools.length) {
            const first = toolLabel(tools[0])
            const more = tools.length > 1 ? ` (+${tools.length - 1} more)` : ''
            patchAgent(who, { toolIcon: first.icon, toolId: id() })
            say(who, e.said ? 'say' : 'tool', e.said ?? `${first.icon} ${first.label}${more}`, 'working')
            addLog({ ...base, kind: 'tool', text: tools.map((t) => toolLabel(t).label).join(' · '), tools })
          } else if (handoffs.length) {
            const names = handoffs.filter(isAgent).map((k) => AGENTS[k].name).join(' & ')
            say(who, 'say', e.said ?? `Handing this to ${names}.`, 'waiting')
          } else if (e.thinking || e.said) {
            say(who, e.said ? 'say' : 'think', e.said ?? e.thinking ?? '', 'thinking')
          }
          break
        }
        case 'tool_results': {
          const bad = (e.results ?? []).filter((r) => !r.ok || (typeof r.result === 'object' && r.result !== null && 'error' in r.result))
          if (bad.length) {
            const err = bad[0].result as { error?: string } | string
            const msg = typeof err === 'string' ? err : (err?.error ?? 'refused')
            say(who, 'warn', `Hmm: ${msg}`, 'thinking')
            addLog({ ...base, kind: 'warn', text: `${toolLabel(bad[0].tool).label}: ${clip(msg, 200)}` })
          } else {
            patchAgent(who, { mood: 'thinking' })
          }
          break
        }
        case 'agent_run_end': {
          const link = e.run_id ? parents.current[e.run_id] : undefined
          const parent = link?.parent ?? null
          say(who, 'say', e.said ?? 'Done.', 'done')
          if (isAgent(parent) && isAgent(who)) {
            fly(who, parent, 'report', AGENTS[who].color)
            patchAgent(parent, { mood: 'thinking' })
            addLog({ ...base, to: parent, kind: 'report', text: clip(e.said, 260) })
          }
          break
        }
        case 'delegation_refused': {
          const to = (e.details?.to_agent as string) ?? null
          if (isAgent(who) && isAgent(to)) fly(who, to, 'refused', '#c0392b')
          say(who, 'warn', `Can't hand that off: ${String(e.details?.reason ?? '')}`)
          addLog({ ...base, to, kind: 'warn', text: `Hand-off refused: ${String(e.details?.reason ?? '')}` })
          break
        }
        case 'ticket_run_end': {
          say('boss', 'say', e.said ?? 'Ticket handled.', 'done')
          addLog({ ...base, agent: 'boss', kind: 'done', text: `Ticket #${e.ticket_id} resolved: ${clip(e.said, 240)}` })
          if (e.ticket_id !== null) setStamp({ ticketId: e.ticket_id, id: id() })
          sawEnd.current = true
          idleTimer.current = window.setTimeout(() => setAgents(freshAgents()), 9000)
          break
        }
      }
    },
    [addLog, fly, patchAgent, say],
  )

  // ------------------------------------------------------------ the player
  useEffect(() => {
    if (!active) return
    let timer: number
    const tick = () => {
      const run = activeRef.current
      if (!run) return
      const next = queue.current.shift()
      setBacklog(queue.current.length)
      if (next) {
        apply(next)
        const hurry = queue.current.length > 12 ? 0.25 : queue.current.length > 5 ? 0.55 : 1
        const pace = run.mode === 'replay' ? 0.6 : 1
        timer = window.setTimeout(tick, (PACE[next.event] ?? 500) * hurry * pace)
        return
      }
      if (serverDone.current && (sawEnd.current || run.mode === 'replay')) {
        activeRef.current = null
        setActive(null)
        finishedRef.current(run)
        return
      }
      timer = window.setTimeout(tick, 300)
    }
    timer = window.setTimeout(tick, 200)
    return () => window.clearTimeout(timer)
  }, [active, apply])

  // ------------------------------------------------------------ the poller (live runs only)
  useEffect(() => {
    if (!active || active.mode !== 'live') return
    let stop = false
    let timer: number
    const poll = async () => {
      try {
        const [ev, st] = await Promise.all([
          api.events({ trace_id: active.traceId, after_seq: lastSeq.current, limit: 1000 }),
          api.runStatus(active.traceId).catch(() => null),
        ])
        if (ev.events.length) {
          queue.current.push(...ev.events)
          lastSeq.current = ev.events[ev.events.length - 1].seq
          setBacklog(queue.current.length)
        }
        if (st && st.status !== 'running') {
          // one last read so nothing written just before the run ended is missed
          const tail = await api.events({ trace_id: active.traceId, after_seq: lastSeq.current, limit: 1000 })
          queue.current.push(...tail.events)
          if (tail.events.length) lastSeq.current = tail.events[tail.events.length - 1].seq
          serverDone.current = true
          if (st.status === 'error' && !queue.current.some((x) => x.event === 'ticket_run_end')) {
            addLog({ time: new Date().toISOString(), agent: null, kind: 'warn', ticketId: active.ticketId,
              text: `The run stopped with an error: ${st.result?.error ?? 'unknown'}` })
            sawEnd.current = true
          }
          return
        }
      } catch {
        /* backend busy or restarting: try again on the next tick */
      }
      if (!stop) timer = window.setTimeout(poll, POLL_MS)
    }
    poll()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [active, addLog])

  // ------------------------------------------------------------ public actions
  const begin = useCallback((run: ActiveRun) => {
    queue.current = []
    parents.current = {}
    lastSeq.current = -1
    serverDone.current = false
    sawEnd.current = false
    window.clearTimeout(idleTimer.current)
    setAgents(freshAgents())
    setStamp(null)
    activeRef.current = run
    setActive(run)
  }, [])

  /** Watch a live run (just started, or already running when the page loaded). */
  const attach = useCallback((traceId: string, ticketId: number) => begin({ traceId, ticketId, mode: 'live' }), [begin])

  /** Replay a finished run from the audit trail. */
  const replay = useCallback(
    async (traceId: string, ticketId: number) => {
      const ev = await api.events({ trace_id: traceId, limit: 1000 })
      begin({ traceId, ticketId, mode: 'replay' })
      addLog({ time: new Date().toISOString(), agent: null, kind: 'system', ticketId, text: `Replaying the team's last run on ticket #${ticketId}.` })
      queue.current = [...ev.events]
      serverDone.current = true
    },
    [addLog, begin],
  )

  const clearScene = useCallback(() => {
    queue.current = []
    activeRef.current = null
    setActive(null)
    setAgents(freshAgents())
    setLetters([])
    setStamp(null)
  }, [])

  return { agents, letters, log, active, stamp, backlog, attach, replay, clearScene, addLog }
}
