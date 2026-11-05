"""Data types for the Campus Customs agent team.

* AgentKey / AGENT_KEYS   the five roles
* Fact, AgentReport       what every agent returns after its loop (structured output)
* TicketOutcome           what the Boss returns when it finishes a ticket
* DelegationResult        what the delegate tool hands back to the agent that asked
* AuditEvent              one line in output/audit_trail.json
* TicketRunResult         what run_ticket() returns to the CLI (and later the FastAPI backend)
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AgentKey = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]
AGENT_KEYS: tuple[AgentKey, ...] = ("boss", "inventory", "accounting", "facilities", "customer_service")

TicketStatus = Literal["open", "in_progress", "waiting_on_approval", "blocked", "resolved"]


class Fact(BaseModel):
    """One checked fact, with the MCP tool it came from (so the Boss can trust it)."""

    statement: str = Field(description="The fact in one sentence, with the numbers, e.g. 'CC-HOOD-NAVY M: 8 on hand, short 12'.")
    source_tool: str = Field(description="The MCP tool that returned it, e.g. 'check_stock'. Use 'ticket' for facts read from the ticket text.")


class AgentReport(BaseModel):
    """What a specialist (or the Boss, when another agent asks it something) hands back."""

    status: Literal["done", "needs_human_approval", "blocked", "needs_more_info", "out_of_scope"] = Field(
        description="done = task finished; needs_human_approval = you filed a request a person must approve; "
        "blocked = a shop rule or missing cash stops it; needs_more_info = you could not get a fact you need; "
        "out_of_scope = this task belongs to another agent."
    )
    summary: str = Field(description="Two to four sentences for the agent that asked you.")
    facts: list[Fact] = Field(default_factory=list, description="The facts you checked with tools. Never include a number you did not get from a tool or the ticket.")
    actions_taken: list[str] = Field(default_factory=list, description="Board writes you made (requests filed, drafts saved, ticket updates), each with its id.")
    approval_request_ids: list[int] = Field(default_factory=list, description="approval_requests ids you filed or found pending.")
    draft_ids: list[int] = Field(default_factory=list, description="drafts ids you saved.")
    alternatives_proposed: list[str] = Field(default_factory=list, description="Customer Service: each alternative you put in a draft (other size, partial order, later date). The Boss must approve each one.")
    recommendations: list[str] = Field(default_factory=list, description="What you recommend the Boss decide or do next.")
    open_questions: list[str] = Field(default_factory=list, description="Anything the data cannot answer and a human should look at.")


class TicketOutcome(BaseModel):
    """The Boss's final call on one ticket."""

    ticket_id: int
    final_status: TicketStatus = Field(description="The status you set on the ticket with update_ticket.")
    decision: str = Field(description="Your final call in one or two sentences (what the shop will do).")
    rationale: str = Field(description="Why, citing the checked facts (stock, cash, invoice, lease, margin).")
    agents_consulted: list[AgentKey] = Field(default_factory=list)
    approval_request_ids: list[int] = Field(default_factory=list, description="Requests waiting for a human.")
    draft_ids: list[int] = Field(default_factory=list, description="Message drafts on the board for a human to send.")
    alternatives_approved: list[str] = Field(default_factory=list, description="Alternatives in the customer draft that you, the Boss, approved.")
    waiting_on_human: list[str] = Field(default_factory=list, description="Each thing a person must do (approve request N, send draft N, decide X).")
    next_steps: list[str] = Field(default_factory=list, description="What the team does after the human acts.")


class DelegationResult(BaseModel):
    """Returned by the delegate tool to the agent that asked for help."""

    to_agent: AgentKey
    ok: bool
    report: AgentReport | None = None
    error: str | None = None


class AuditEvent(BaseModel):
    """One entry in output/audit_trail.json (the file is a JSON list; entries are only appended).

    event:
      ticket_run_start / ticket_run_end   one ticket handed to the Boss, and how it ended
      agent_run_start / agent_run_end     one agent loop (the Boss's, or a delegated one)
      model_step                          one loop step: what the model said / decided to call
      tool_results                        what the tools returned for that step
      delegation_refused                  a hand-off the guardrails blocked (depth, cycle, budget)
      human_decision                      a person approved or rejected a request
    """

    time: str
    event: str
    trace_id: str | None = None          # one id per ticket run, shared by every agent in it
    run_id: str | None = None            # one id per agent loop
    parent_run_id: str | None = None     # the loop that delegated to this one
    agent: AgentKey | str | None = None
    depth: int | None = None             # 0 = Boss on the ticket, 1 = first hand-off, ...
    ticket_id: int | None = None
    step: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class TicketRunResult(BaseModel):
    trace_id: str
    ticket_id: int
    ok: bool
    outcome: TicketOutcome | None = None
    error: str | None = None
    usage: dict[str, Any] = Field(default_factory=dict)
    seconds: float = 0.0
