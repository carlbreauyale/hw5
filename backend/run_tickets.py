"""Run the agent team on tickets from the command line (run from the backend/ folder).

    python run_tickets.py --ticket 102          # one ticket
    python run_tickets.py --all                 # every open ticket, oldest first
    python run_tickets.py --all --reset         # reset the working DB first (do this before a full run)

Every agent loop step is appended to output/audit_trail.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json

import reset_db
from agents import run_open_tickets, run_ticket


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Campus Customs agent team")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ticket", type=int, help="ticket id to work, e.g. 101")
    group.add_argument("--all", action="store_true", help="work every open ticket")
    parser.add_argument("--reset", action="store_true", help="copy the original DB over the working copy first")
    args = parser.parse_args()

    if args.reset:
        print(reset_db.reset())
    results = await run_open_tickets() if args.all else [await run_ticket(args.ticket)]
    for r in results:
        print(json.dumps(r.model_dump(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
