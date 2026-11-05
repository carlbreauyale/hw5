"""Campus Customs backend: FastAPI routes for the React dashboard.

Start it from the backend/ folder:
    uvicorn main:app --reload --port 8000
Interactive docs: http://localhost:8000/docs

Shop facts and every change to the shop go through the campus-customs MCP server
(the same 16 tools the agents use), attached in-process once for the app's lifetime.
The only route that moves money is POST /api/approvals/{request_id}/approve, which a
person triggers by clicking Approve; it calls the human-only MCP tool decide_approval.

Routes
    GET  /api/health                        is the backend up (model, DB, run in progress)
    GET  /api/tickets                       the tickets, each open, running or resolved
    GET  /api/tickets/{ticket_id}/summary   what each agent did on the ticket's latest run
    POST /api/tickets/{ticket_id}/run       run the agent team on one ticket
    GET  /api/runs/{trace_id}               status / result of one team run
    GET  /api/events                        recent agent events (who said what, which tools)
    GET  /api/approvals                     approval requests (pending by default)
    POST /api/approvals/{request_id}/approve   a human approves -> payment happens, cash changes
    POST /api/approvals/{request_id}/reject    a human rejects a request
    GET  /api/board                         approval requests, message drafts, ticket updates
    GET  /api/cash                          current checking balance from cash_accounts
    POST /api/reset                         reset the working DB to the original values
"""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import approvals
import audit
import reset_db
from agents import mcp_toolset, new_trace_id, run_ticket
from config import AUDIT_PATH, MODEL_NAME, WORKING_DB
from models import TicketRunResult

# ---------------------------------------------------------------- app


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One in-process MCP session for the whole app; agent runs and routes share it.
    async with mcp_toolset():
        yield


app = FastAPI(title="Campus Customs backend", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # The React dev server (Vite on 5173, or create-react-app on 3000); 5174 is a second
    # copy of the board used for screenshots while the main one is open.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Team runs: one at a time, so two tickets never compete for the same cash at once.
RUNS: dict[str, dict[str, Any]] = {}
_run_lock = asyncio.Lock()


async def mcp(tool: str, **args: Any) -> Any:
    """Call one campus-customs MCP tool and return its structured result."""
    return await mcp_toolset().direct_call_tool(tool, args)


def _raise_if_tool_error(result: Any, status_code: int = 409) -> None:
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=status_code, detail=result)


def _running() -> dict[str, Any] | None:
    return next((r for r in RUNS.values() if r["status"] == "running"), None)


def _audit_rows() -> list[dict[str, Any]]:
    if AUDIT_PATH.exists() and AUDIT_PATH.stat().st_size > 0:
        try:
            rows = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
            return rows if isinstance(rows, list) else []
        except json.JSONDecodeError:
            return []  # a write is in progress; the next poll will read it
    return []


def _since_last_reset(rows: list[dict[str, Any]]) -> list[tuple[int, dict[str, Any]]]:
    """(seq, entry) pairs after the most recent db_reset: earlier runs belong to an old database."""
    start = max((i for i, e in enumerate(rows) if e.get("event") == "db_reset"), default=-1) + 1
    return [(i, rows[i]) for i in range(start, len(rows))]


def _last_runs(rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """ticket_id -> its latest finished team run since the last reset."""
    out: dict[int, dict[str, Any]] = {}
    for _, e in _since_last_reset(rows):
        if e.get("event") == "ticket_run_end" and e.get("ticket_id") is not None:
            d = e.get("data", {})
            out[e["ticket_id"]] = {
                "trace_id": e.get("trace_id"),
                "finished_at": e.get("time"),
                "ok": bool(d.get("ok")),
                "final_status": (d.get("outcome") or {}).get("final_status"),
                "decision": (d.get("outcome") or {}).get("decision"),
            }
    return out


# ---------------------------------------------------------------- request / response bodies

class Decision(BaseModel):
    approver: str = Field(min_length=1, description="The person clicking Approve/Reject (agents cannot approve).")
    note: str = ""


class RunStatus(BaseModel):
    trace_id: str
    ticket_id: int
    status: Literal["running", "done", "error"]
    started_at: str
    seconds: float | None = None
    result: TicketRunResult | None = None


# ---------------------------------------------------------------- routes

@app.get("/api/health")
async def health() -> dict[str, Any]:
    running = _running()
    return {
        "ok": True,
        "model": MODEL_NAME,
        "database": WORKING_DB.name,
        "audit_file": AUDIT_PATH.name,
        "run_in_progress": {"trace_id": running["trace_id"], "ticket_id": running["ticket_id"]} if running else None,
    }


@app.get("/api/tickets")
async def list_tickets() -> dict[str, Any]:
    """All tickets, each marked open, running or resolved.

    state = "resolved" once the agent team has finished a run on the ticket (since the last
    reset) or the Boss set status "resolved"; `status` keeps the Boss's detailed status
    (e.g. waiting_on_approval: the team is done and a person must approve a payment)."""
    data = await mcp("list_open_tickets", include_resolved=True)
    board = await mcp("list_board")
    last_runs = _last_runs(_audit_rows())
    running = _running()
    tickets = []
    for t in data["open_tickets"]:
        reqs = [r for r in board["approval_requests"] if r["ticket_id"] == t["id"]]
        last = last_runs.get(t["id"])
        if running and running["ticket_id"] == t["id"]:
            state = "running"
        elif t["status"] == "resolved" or (last and last["ok"]):
            state = "resolved"
        else:
            state = "open"
        tickets.append({
            **t,
            "state": state,
            "last_run": last,
            "pending_approvals": sum(r["status"] == "pending" for r in reqs),
            "drafts": sum(d["ticket_id"] == t["id"] for d in board["drafts"]),
        })
    return {"shop_today": data["shop_today"], "tickets": tickets}


@app.post("/api/tickets/{ticket_id}/run", status_code=202, response_model=RunStatus)
async def run_ticket_route(ticket_id: int, wait: bool = Query(False, description="Wait for the run to finish and return the result (30-120 s).")) -> RunStatus:
    """Run the agent team on one ticket. Returns at once with a trace_id (poll /api/events or
    /api/runs/{trace_id}); with ?wait=true it returns the finished result."""
    ticket = await mcp("get_ticket", ticket_id=ticket_id)
    _raise_if_tool_error(ticket, 404)
    if _run_lock.locked():
        busy = _running()
        raise HTTPException(409, detail={"error": "A team run is already in progress.",
                                         "trace_id": busy["trace_id"] if busy else None,
                                         "ticket_id": busy["ticket_id"] if busy else None})

    trace_id = new_trace_id()
    record = {"trace_id": trace_id, "ticket_id": ticket_id, "status": "running",
              "started_at": audit.now_iso(), "seconds": None, "result": None}
    RUNS[trace_id] = record
    started = time.perf_counter()

    async def work() -> None:
        async with _run_lock:
            try:
                result = await run_ticket(ticket_id, trace_id=trace_id)
                record.update(status="done" if result.ok else "error", result=result)
            except Exception as exc:  # run_ticket already catches agent errors; this is a last resort
                record.update(status="error", result=TicketRunResult(
                    trace_id=trace_id, ticket_id=ticket_id, ok=False, error=f"{type(exc).__name__}: {exc}"[:300]))
            record["seconds"] = round(time.perf_counter() - started, 2)

    task = asyncio.create_task(work())
    record["task"] = task
    if wait:
        await task
    return RunStatus(**{k: v for k, v in record.items() if k != "task"})


@app.get("/api/tickets/{ticket_id}/summary")
async def ticket_summary(ticket_id: int) -> dict[str, Any]:
    """A short summary of what each agent did on this ticket's latest run (since the last reset):
    its report, the tools it used, who it handed work to, and the Boss's final call."""
    rows = _since_last_reset(_audit_rows())
    traces = [e.get("trace_id") for _, e in rows if e.get("event") == "ticket_run_start" and e.get("ticket_id") == ticket_id]
    if not traces:
        return {"ticket_id": ticket_id, "trace_id": None, "finished": False, "agents": [], "outcome": None}
    trace = traces[-1]
    agents: dict[str, dict[str, Any]] = {}
    outcome, finished, usage = None, False, None
    for _, e in rows:
        if e.get("trace_id") != trace:
            continue
        ev, who, d = e.get("event"), e.get("agent"), e.get("data", {})
        if ev == "ticket_run_end":
            finished, outcome, usage = True, d.get("outcome"), d.get("usage")
            continue
        if not who:
            continue
        a = agents.setdefault(who, {"agent": who, "runs": 0, "steps": 0, "tools_used": {}, "delegated_to": [],
                                    "delegated_by": [], "summary": None, "status": None})
        if ev == "agent_run_start":
            a["runs"] += 1
            if d.get("delegated_by") and d["delegated_by"] not in a["delegated_by"]:
                a["delegated_by"].append(d["delegated_by"])
        elif ev == "model_step":
            a["steps"] += 1
            for c in d.get("tool_calls", []):
                name = c.get("tool")
                if name == "delegate":
                    to = (c.get("args") or {}).get("to_agent")
                    if to and to not in a["delegated_to"]:
                        a["delegated_to"].append(to)
                elif name and name != "final_result":
                    a["tools_used"][name] = a["tools_used"].get(name, 0) + 1
        elif ev == "delegation_refused":  # the guardrails blocked it, so it was not a real hand-off
            if d.get("to_agent") in a["delegated_to"]:
                a["delegated_to"].remove(d["to_agent"])
        elif ev == "agent_run_end":
            out = d.get("output") or {}
            a["summary"] = out.get("summary") or out.get("decision") or a["summary"]
            a["status"] = out.get("status") or out.get("final_status") or d.get("status")
    order = ["boss", "inventory", "accounting", "facilities", "customer_service"]
    return {
        "ticket_id": ticket_id,
        "trace_id": trace,
        "finished": finished,
        "outcome": outcome,
        "usage": usage,
        "agents": sorted(agents.values(), key=lambda a: order.index(a["agent"]) if a["agent"] in order else 99),
    }


@app.get("/api/runs/{trace_id}", response_model=RunStatus)
async def get_run(trace_id: str) -> RunStatus:
    record = RUNS.get(trace_id)
    if record is None:
        raise HTTPException(404, detail={"error": f"No run {trace_id} since the server started."})
    return RunStatus(**{k: v for k, v in record.items() if k != "task"})


def _event_view(seq: int, e: dict[str, Any]) -> dict[str, Any]:
    """Turn one audit entry into what the board shows: who, what they said, which tools."""
    d = e.get("data", {})
    view = {k: e.get(k) for k in ("time", "event", "agent", "ticket_id", "trace_id", "run_id", "depth", "step")}
    view["seq"] = seq
    ev = e.get("event")
    if ev == "model_step":
        calls = d.get("tool_calls", [])
        view["said"] = " ".join(d.get("text", [])).strip() or None
        view["thinking"] = " ".join(d.get("thinking", [])).strip() or None
        view["tools_used"] = [c["tool"] for c in calls if c["tool"] != "final_result"]
        view["tool_calls"] = [{"tool": c["tool"], "args": c.get("args")} for c in calls if c["tool"] != "final_result"]
        view["delegated_to"] = [c["args"].get("to_agent") for c in calls if c["tool"] == "delegate" and c.get("args")]
        view["final_report"] = next((c.get("args") for c in calls if c["tool"] == "final_result"), None)
    elif ev == "tool_results":
        view["tools_used"] = [r["tool"] for r in d.get("results", [])]
        view["results"] = [{"tool": r["tool"], "ok": r["ok"], "result": audit.preview(r["result"], 400)}
                           for r in d.get("results", [])]
    elif ev == "agent_run_start":
        view["said"] = d.get("task")
        view["delegated_by"] = d.get("delegated_by")
    elif ev == "agent_run_end":
        out = d.get("output") or {}
        view["said"] = out.get("summary") or out.get("decision")
        view["status"] = d.get("status")
        view["seconds"] = d.get("seconds")
    elif ev == "ticket_run_end":
        out = d.get("outcome") or {}
        view["said"] = out.get("decision") or d.get("error")
        view["status"] = "ok" if d.get("ok") else "error"
        view["usage"] = d.get("usage")
    else:  # ticket_run_start, delegation_refused, human_decision, db_reset
        view["details"] = d
    return view


@app.get("/api/events")
async def events(
    limit: int = Query(100, ge=1, le=1000, description="Most recent N events."),
    after_seq: int | None = Query(None, description="Only events after this seq (for incremental polling)."),
    ticket_id: int | None = None,
    trace_id: str | None = None,
    agent: str | None = None,
) -> dict[str, Any]:
    """Recent agent events from output/audit_trail.json: what each agent said and which tools it used."""
    rows = _audit_rows()
    picked = []
    for seq, e in enumerate(rows):
        if after_seq is not None and seq <= after_seq:
            continue
        if ticket_id is not None and e.get("ticket_id") != ticket_id:
            continue
        if trace_id is not None and e.get("trace_id") != trace_id:
            continue
        if agent is not None and e.get("agent") != agent:
            continue
        picked.append(_event_view(seq, e))
    return {"total_in_file": len(rows), "last_seq": len(rows) - 1, "events": picked[-limit:]}


@app.get("/api/approvals")
async def list_approvals(status: Literal["pending", "paid", "rejected", "withdrawn", "all"] = "pending") -> dict[str, Any]:
    """Payment / purchase-order requests the agents prepared (pending by default)."""
    rows = await approvals.list_requests(None if status == "all" else status)
    return {"status": status, "requests": rows}


@app.post("/api/approvals/{request_id}/approve")
async def approve(request_id: int, body: Decision) -> dict[str, Any]:
    """A human approved: pay it. This is the only route that changes cash. Refused (409) if it
    would break a rule: not enough cash, below the $100 reserve, or the vendor still blocked."""
    result = await approvals.decide(request_id, "approve", body.approver, body.note)
    _raise_if_tool_error(result)
    cash = await mcp("get_cash_position")
    return {"result": result, "cash": {k: cash[k] for k in ("balance", "pending_total", "spendable_after_pending")}}


@app.post("/api/approvals/{request_id}/reject")
async def reject(request_id: int, body: Decision) -> dict[str, Any]:
    """A human rejected the request. No money moves."""
    result = await approvals.decide(request_id, "reject", body.approver, body.note)
    _raise_if_tool_error(result)
    return {"result": result}


@app.get("/api/board")
async def board(ticket_id: int | None = None) -> dict[str, Any]:
    """Everything the agents left on the board: approval requests, message drafts, ticket updates."""
    return await mcp("list_board", ticket_id=ticket_id) if ticket_id is not None else await mcp("list_board")


@app.get("/api/cash")
async def cash() -> dict[str, Any]:
    """Current checking balance from cash_accounts, plus what pending requests would leave."""
    data = await mcp("get_cash_position", account="checking")
    _raise_if_tool_error(data, 404)
    return {k: data[k] for k in ("account", "balance", "balance_as_of", "pending_total",
                                 "balance_after_all_pending", "min_cash_reserve", "spendable_after_pending",
                                 "payments_made")}


@app.post("/api/reset")
async def reset() -> dict[str, Any]:
    """Reset the working DB to the original values (clears the board). The audit trail is kept."""
    if _run_lock.locked():
        raise HTTPException(409, detail={"error": "A team run is in progress; reset after it finishes."})
    message = reset_db.reset()
    cash_now = await mcp("get_cash_position")
    return {"ok": True, "message": message, "balance": cash_now["balance"]}
