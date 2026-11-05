"""Human approval desk (command line until the dashboard exists). Run from backend/.

    python approvals.py list
    python approvals.py approve 3 --by "Carl Breau" [--note "ok"]
    python approvals.py reject 4 --by "Carl Breau" --note "too expensive"

This is the only path that moves money. It calls the MCP tool decide_approval, which no
agent can see, and every decision is appended to output/audit_trail.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

import audit
from agents.team import mcp_toolset


async def list_requests(status: str | None = "pending") -> list[dict[str, Any]]:
    async with mcp_toolset() as ts:
        board = await ts.direct_call_tool("list_board", {})
    rows = board["approval_requests"]
    return [r for r in rows if status is None or r["status"] == status]


async def decide(request_id: int, decision: str, approver: str, note: str = "") -> dict[str, Any]:
    async with mcp_toolset() as ts:
        result = await ts.direct_call_tool(
            "decide_approval",
            {"request_id": request_id, "decision": decision, "approver": approver, "note": note},
        )
    audit.append("human_decision", agent=f"human:{approver}", data={
        "request_id": request_id, "decision": decision, "note": note, "result": result,
    })
    return result


async def main() -> None:
    parser = argparse.ArgumentParser(description="Approve or reject payment / purchase-order requests")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    for cmd in ("approve", "reject"):
        p = sub.add_parser(cmd)
        p.add_argument("request_id", type=int)
        p.add_argument("--by", required=True, help="your name (agents cannot approve)")
        p.add_argument("--note", default="")
    args = parser.parse_args()
    if args.cmd == "list":
        out = await list_requests()
    else:
        out = await decide(args.request_id, args.cmd, args.by, args.note)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
