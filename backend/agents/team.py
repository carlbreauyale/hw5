"""The Campus Customs agent team: five PydanticAI agents, one MCP toolset, full-mesh delegation.

How it fits together
--------------------
* Shop facts and every board write go through the campus-customs MCP server
  (mcp_server/server.py), attached in-process with MCPToolset. There is no second tools
  layer: each agent sees a filtered view of the same MCP toolset (least privilege), and
  nobody gets decide_approval, which is reserved for a human.
* Every agent also has one local tool, `delegate(to_agent, task)`, so any agent can hand
  work to any other (full connectivity). Guardrails: no self-delegation, no delegating back
  to an agent that is waiting on you (cycle), max depth, and a per-ticket delegation budget.
* Each agent loop is driven with Agent.iter(), and every step is appended to
  output/audit_trail.json the moment it happens: what the model said or thought, the tool
  calls it decided to make, then what the tools returned.
* All agents in one ticket share a single usage counter, so the token / request / tool-call
  caps in config.py apply to the whole ticket. Each agent loop also has its own step cap.
"""

from __future__ import annotations

import sys
import time
import uuid
from dataclasses import dataclass, replace
from functools import lru_cache
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.usage import RunUsage

import audit
from config import (
    MAX_DELEGATION_DEPTH,
    MAX_DELEGATION_TASK_CHARS,
    MAX_DELEGATIONS_PER_TICKET,
    MCP_SERVER_DIR,
    MODEL_NAME,
    MODEL_SETTINGS,
    RUN_REQUEST_LIMIT,
    steps_for,
    TICKET_LIMITS,
    build_model,
    load_prompt,
)
from models import AgentKey, AgentReport, DelegationResult, TicketOutcome, TicketRunResult

from . import accounting, boss, customer_service, facilities, inventory
from .role import AgentRole

ROLES: dict[str, AgentRole] = {
    m.ROLE.key: m.ROLE for m in (boss, inventory, accounting, facilities, customer_service)
}

# The MCP tools that record who did something. The backend fills these in from the calling
# agent, so an agent can neither forget them nor sign as someone else.
AUTHOR_FIELD = {
    "request_payment": "requested_by",
    "request_purchase_order": "requested_by",
    "draft_message": "drafted_by",
    "update_ticket": "updated_by",
    "withdraw_request": "withdrawn_by",
}
HUMAN_ONLY_TOOLS = {"decide_approval"}


class StepLimitReached(Exception):
    """One agent loop used all of its RUN_REQUEST_LIMIT model calls."""


# ---------------------------------------------------------------- run state

@dataclass
class TeamRun:
    """Shared by every agent working on one ticket."""

    trace_id: str
    ticket_id: int | None
    delegations: int = 0


@dataclass
class AgentDeps:
    """Per agent loop."""

    agent: AgentKey
    run_id: str
    parent_run_id: str | None
    depth: int
    waiting: tuple[AgentKey, ...]   # agents up the chain that are waiting on this one
    team: TeamRun


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------- MCP toolset

@lru_cache(maxsize=1)
def mcp_toolset() -> MCPToolset:
    """The campus-customs FastMCP server, attached in-process (same tools as .mcp.json)."""
    if str(MCP_SERVER_DIR) not in sys.path:
        sys.path.insert(0, str(MCP_SERVER_DIR))
    from server import mcp as campus_mcp  # noqa: PLC0415  (mcp_server/server.py)

    return MCPToolset(campus_mcp, process_tool_call=_stamp_author)


async def _stamp_author(ctx: RunContext[AgentDeps], call_tool, name: str, tool_args: dict[str, Any]):
    """Fill requested_by / drafted_by / updated_by with the agent that actually made the call."""
    field = AUTHOR_FIELD.get(name)
    if field:
        tool_args = {**tool_args, field: ctx.deps.agent}
    return await call_tool(name, tool_args)


def _toolset_for(role: AgentRole):
    allowed = set(role.mcp_tools) - HUMAN_ONLY_TOOLS

    async def hide_author_fields(ctx: RunContext[AgentDeps], defs: list[ToolDefinition]) -> list[ToolDefinition]:
        out = []
        for d in defs:
            field = AUTHOR_FIELD.get(d.name)
            if field:
                schema = dict(d.parameters_json_schema)
                schema["properties"] = {k: v for k, v in schema.get("properties", {}).items() if k != field}
                schema["required"] = [r for r in schema.get("required", []) if r != field]
                d = replace(d, parameters_json_schema=schema)
            out.append(d)
        return out

    return mcp_toolset().filtered(lambda ctx, d: d.name in allowed).prepared(hide_author_fields)


# ---------------------------------------------------------------- agents

def _context_instructions(ctx: RunContext[AgentDeps]) -> str:
    d = ctx.deps
    waiting = ", ".join(d.waiting) if d.waiting else "nobody (you were given this task directly)"
    return (
        "## This run\n"
        f"- You are `{d.agent}`. Ticket: {d.team.ticket_id if d.team.ticket_id is not None else 'none given'}.\n"
        f"- Waiting on your answer: {waiting}. Do not delegate back to them; return your report.\n"
        f"- Delegation depth {d.depth} of max {MAX_DELEGATION_DEPTH}; "
        f"hand-offs used on this ticket: {d.team.delegations} of {MAX_DELEGATIONS_PER_TICKET}.\n"
        f"- Your loop may use at most {steps_for(d.agent)} model steps, so batch independent tool calls"
        " and keep one step for your final report."
    )


async def delegate(ctx: RunContext[AgentDeps], to_agent: AgentKey, task: str) -> DelegationResult:
    """Hand a piece of work to another agent on the team and get its report back.

    Agents: boss (routing and final calls), inventory (stock, shortfalls, restock vendor and
    ETA), accounting (cash, invoices, margins, payment / purchase-order requests for human
    approval), facilities (lease, rent, landlord), customer_service (message drafts).

    Args:
        to_agent: Who should do it. Not yourself, and not an agent that is waiting on you.
        task: A short, complete brief: the ticket id, exactly what you need, facts already
            known (with numbers) so they don't re-check them, and what to hand back.
    """
    d = ctx.deps
    refusal = None
    if to_agent not in ROLES:
        refusal = f"Unknown agent {to_agent!r}."
    elif to_agent == d.agent:
        refusal = "You cannot delegate to yourself."
    elif to_agent in d.waiting:
        refusal = f"{to_agent} is waiting on your answer. Return your report instead of delegating back."
    elif d.depth + 1 > MAX_DELEGATION_DEPTH:
        refusal = f"Delegation depth limit ({MAX_DELEGATION_DEPTH}) reached. Finish with what you have."
    elif d.team.delegations >= MAX_DELEGATIONS_PER_TICKET:
        refusal = f"This ticket has used all {MAX_DELEGATIONS_PER_TICKET} hand-offs. Finish with what you have."
    elif not task.strip():
        refusal = "The task brief is empty."
    if refusal:
        audit.append(
            "delegation_refused", trace_id=d.team.trace_id, run_id=d.run_id, agent=d.agent,
            depth=d.depth, ticket_id=d.team.ticket_id, data={"to_agent": to_agent, "reason": refusal},
        )
        return DelegationResult(to_agent=to_agent, ok=False, error=refusal)

    d.team.delegations += 1
    try:
        report = await run_agent(
            to_agent, task.strip()[:MAX_DELEGATION_TASK_CHARS], team=d.team, parent=d, usage=ctx.usage
        )
        return DelegationResult(to_agent=to_agent, ok=True, report=report)
    except UsageLimitExceeded:
        raise  # the whole ticket is out of budget: stop the run
    except Exception as exc:  # a failed specialist must not crash the caller's loop
        return DelegationResult(to_agent=to_agent, ok=False, error=f"{type(exc).__name__}: {str(exc)[:300]}")


@lru_cache(maxsize=None)
def get_agent(key: str) -> Agent[AgentDeps, AgentReport]:
    """Build each agent once (lazily, so importing this module never needs the API key)."""
    role = ROLES[key]
    agent: Agent[AgentDeps, AgentReport] = Agent(
        build_model(),
        name=role.key,
        deps_type=AgentDeps,
        output_type=AgentReport,
        instructions=[load_prompt(role.prompt_file), _context_instructions],
        toolsets=[_toolset_for(role)],
        tools=[delegate],
        model_settings=MODEL_SETTINGS,
        retries=2,
    )
    return agent


# ---------------------------------------------------------------- audit helpers

def _usage_dict(u: Any) -> dict[str, Any]:
    keys = ("requests", "tool_calls", "input_tokens", "output_tokens", "total_tokens")
    return {k: getattr(u, k) for k in keys if getattr(u, k, None) is not None}


def _model_step(response: ModelResponse) -> dict[str, Any]:
    thinking, text, calls = [], [], []
    for part in response.parts:
        if isinstance(part, ThinkingPart) and part.content:
            thinking.append(part.content)
        elif isinstance(part, TextPart) and part.content:
            text.append(part.content)
        elif isinstance(part, ToolCallPart):
            calls.append({"tool": part.tool_name, "call_id": part.tool_call_id, "args": part.args_as_dict()})
    return {
        "model": response.model_name or MODEL_NAME,
        "finish_reason": response.finish_reason,
        "thinking": thinking,
        "text": text,
        "tool_calls": calls,
        "step_usage": _usage_dict(response.usage),
    }


def _tool_results(request: ModelRequest) -> list[dict[str, Any]]:
    out = []
    for part in request.parts:
        if isinstance(part, ToolReturnPart):
            content = part.content.model_dump() if hasattr(part.content, "model_dump") else part.content
            out.append({"tool": part.tool_name, "call_id": part.tool_call_id, "ok": True,
                        "result": audit.preview(content)})
        elif isinstance(part, RetryPromptPart):
            out.append({"tool": part.tool_name, "call_id": part.tool_call_id, "ok": False,
                        "result": audit.preview(part.content if isinstance(part.content, str) else str(part.content))})
    return out


# ---------------------------------------------------------------- the agent loop

async def run_agent(
    key: AgentKey,
    task: str,
    *,
    team: TeamRun,
    parent: AgentDeps | None = None,
    usage: RunUsage | None = None,
    output_type: type = AgentReport,
):
    """Run one agent's loop on `task`, auditing every step. Returns its structured output."""
    deps = AgentDeps(
        agent=key,
        run_id=_new_id("run"),
        parent_run_id=parent.run_id if parent else None,
        depth=parent.depth + 1 if parent else 0,
        waiting=(*parent.waiting, parent.agent) if parent else (),
        team=team,
    )
    usage = usage if usage is not None else RunUsage()
    common = dict(trace_id=team.trace_id, run_id=deps.run_id, agent=key, depth=deps.depth, ticket_id=team.ticket_id)
    audit.append("agent_run_start", parent_run_id=deps.parent_run_id,
                 data={"task": task, "delegated_by": parent.agent if parent else None,
                       "tools": list(ROLES[key].mcp_tools) + ["delegate"], "model": MODEL_NAME}, **common)

    started, step, status, output = time.perf_counter(), 0, "ok", None
    try:
        async with get_agent(key).iter(
            task, deps=deps, usage=usage, usage_limits=TICKET_LIMITS, output_type=output_type
        ) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    results = _tool_results(node.request)
                    if results:
                        audit.append("tool_results", step=step, data={"results": results}, **common)
                    if step >= steps_for(key):
                        raise StepLimitReached(f"{key} used all {steps_for(key)} steps")
                elif Agent.is_call_tools_node(node):
                    step += 1
                    audit.append("model_step", step=step, data=_model_step(node.model_response), **common)
            output = run.result.output
        return output
    except UsageLimitExceeded as exc:
        status = f"usage_limit: {exc}"
        raise
    except StepLimitReached as exc:
        status = f"step_limit: {exc}"
        output = AgentReport(status="blocked", summary=f"Stopped: {exc}. Partial work is in the audit trail.")
        return output
    except Exception as exc:
        status = f"error: {type(exc).__name__}: {str(exc)[:300]}"
        raise
    finally:
        audit.append("agent_run_end", parent_run_id=deps.parent_run_id, step=step, data={
            "status": status,
            "output": output.model_dump() if output is not None else None,
            "seconds": round(time.perf_counter() - started, 2),
            "ticket_usage_so_far": _usage_dict(usage),
        }, **common)


# ---------------------------------------------------------------- entry points

def new_trace_id() -> str:
    return _new_id("trace")


async def run_ticket(ticket_id: int, trace_id: str | None = None) -> TicketRunResult:
    """Hand one ticket to the Boss; the Boss delegates across the team and makes the call."""
    team = TeamRun(trace_id=trace_id or new_trace_id(), ticket_id=ticket_id)
    usage = RunUsage()
    audit.append("ticket_run_start", trace_id=team.trace_id, ticket_id=ticket_id,
                 data={"model": MODEL_NAME, "limits": {
                     "requests": TICKET_LIMITS.request_limit, "tool_calls": TICKET_LIMITS.tool_calls_limit,
                     "total_tokens": TICKET_LIMITS.total_tokens_limit, "steps_per_agent": RUN_REQUEST_LIMIT, "steps_boss": steps_for("boss"),
                     "max_depth": MAX_DELEGATION_DEPTH, "max_delegations": MAX_DELEGATIONS_PER_TICKET}})
    task = (
        f"Work ticket #{ticket_id}. Start with get_ticket({ticket_id}). Route the work to the specialists "
        "who own each part, make the final call, record it with update_ticket, and return your TicketOutcome."
    )
    started = time.perf_counter()
    result = TicketRunResult(trace_id=team.trace_id, ticket_id=ticket_id, ok=False)
    try:
        async with mcp_toolset():  # one in-process MCP session for the whole ticket
            outcome = await run_agent("boss", task, team=team, usage=usage, output_type=TicketOutcome)
        if isinstance(outcome, TicketOutcome):
            result.ok, result.outcome = True, outcome
        else:  # step limit hit: run_agent returned a blocked AgentReport instead
            result.error = getattr(outcome, "summary", "Boss did not finish.")
    except UsageLimitExceeded as exc:
        result.error = f"Ticket budget used up: {exc}"
    except Exception as exc:
        result.error = f"{type(exc).__name__}: {str(exc)[:300]}"
    result.usage = _usage_dict(usage)
    result.seconds = round(time.perf_counter() - started, 2)
    audit.append("ticket_run_end", trace_id=team.trace_id, ticket_id=ticket_id, data={
        "ok": result.ok, "error": result.error, "usage": result.usage, "seconds": result.seconds,
        "delegations": team.delegations,
        "outcome": result.outcome.model_dump() if result.outcome else None,
    })
    return result


async def open_ticket_ids() -> list[int]:
    """Read the open tickets through the MCP server (no model call)."""
    async with mcp_toolset() as ts:
        data = await ts.direct_call_tool("list_open_tickets", {})
    return [t["id"] for t in data["open_tickets"]]


async def run_open_tickets() -> list[TicketRunResult]:
    """Work every open ticket, one at a time, oldest first."""
    return [await run_ticket(tid) for tid in await open_ticket_ids()]
