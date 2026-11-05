# Campus Customs: Multi-Agent Operations (MGT 409 · Homework 5)

An agent team that runs the **Campus Customs** shop's ticket board: customer orders, rent, unpaid bills and discount requests. A human watches the team work and approves any money that moves.

It has three parts that talk to each other:

| Part | Folder | What it does |
|---|---|---|
| **MCP server** | `mcp_server/` | FastMCP server with 16 shop tools over the working database. Every shop fact and every change goes through these tools. |
| **Backend** | `backend/` | FastAPI plus a **PydanticAI** team of five agents: Boss, Inventory, Accounting, Facilities and Customer Service. Any agent can delegate to any other. All of them use `gpt-6-luna` through Portkey and the OpenAI SDK. |
| **Dashboard** | `frontend/` | A React + Vite + TypeScript "agent desk". Pick a ticket, watch the agents work through the shop window, and approve payments. |

Safety rules are enforced in code. Agents can only *request* payments. A named human approves on the dashboard, and only that approval moves cash. Approvals never let the balance go below the $100 reserve. Every agent loop step is appended to `output/audit_trail.json`.

---

## Repository layout

```
hw5/
├── AI_prompts.md            # every prompt typed in the vibe coder, with a log of the replies
├── requirements.txt         # Python dependencies (MCP server + backend)
├── .env.example             # template: copy to .env and add your PORTKEY_API_KEY
├── .gitignore               # keeps the real .env out of git
├── .mcp.json                # registers the MCP server with the vibe coder (Claude Code)
├── README.md
├── data/
│   ├── campus_customs.db       # ORIGINAL shop database: never written, used to reset
│   └── campus_customs_new.db   # WORKING copy the tools read and write
├── mcp_server/
│   ├── server.py            # the 16 MCP tools
│   └── README.md
├── frontend/                # React + Vite + TypeScript dashboard
├── backend/
│   ├── main.py              # FastAPI routes for the dashboard
│   ├── models.py            # data types (reports, ticket outcome, audit events)
│   ├── config.py            # model, Portkey, paths, token and loop limits
│   ├── audit.py             # append-only audit trail writer
│   ├── agents/              # boss.py, inventory.py, accounting.py, facilities.py,
│   │                        # customer_service.py (one role each) + team.py (loop, delegation)
│   ├── prompts/             # boss.md, inventory.md, accounting.md, facilities.md, customer_service.md
│   ├── reset_db.py          # copy the original DB over the working copy
│   ├── run_tickets.py       # run tickets from the command line
│   └── approvals.py         # approve or reject requests from the command line
└── output/
    ├── harness.md           # full harness: tables, MCP tools, agents, routes, dashboard, safety, results
    ├── mcp_smoke.json       # Problem 4: each MCP tool called from the vibe coder
    ├── desk_tickets.html    # Problem 9: Expected vs Actual per ticket, Cash tab, Reflection tab
    ├── design.md            # Problem 8: dashboard design choices
    ├── resolved_tickets.json
    ├── resolved_board.html  # screenshots of the board after each ticket was resolved
    ├── audit_trail.json     # every agent loop step (appended, never wiped)
    └── github_url.txt
```

---

## Setup (once)

You need **Python 3.12+** (built with 3.14) and **Node.js 20+** (built with 24).

```bash
git clone https://github.com/carlbreauyale/hw5.git
cd hw5
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

Then create your `.env` from the template and put your Portkey key in it:

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

The backend reads `PORTKEY_API_KEY` from `.env` in the repo root (or from the folder above it).

---

## Running it

### 1. Copy the original database to the working copy (whenever you want a clean run)

`data/campus_customs.db` is the original. The tools never write to it. `data/campus_customs_new.db` is the working copy the agents change. The copy in this repo holds the end state of our three-ticket run: checking at $160, invoice 501 and the rent paid.

To start clean, copy the original over the working copy (do this while the backend is stopped):

```bash
cp data/campus_customs.db data/campus_customs_new.db
```

Windows PowerShell:

```powershell
Copy-Item data\campus_customs.db data\campus_customs_new.db -Force
```

The same reset is also available from the backend folder (`python reset_db.py`), from the dashboard's **↺ Reset shop** button, and from the API (`POST /api/reset`).

### 2. Start the MCP server

The backend attaches the same MCP server **in-process** (PydanticAI `MCPToolset`), so the agents get the tools automatically when the backend starts. To run the server on its own, for example to inspect the tools or to use it from another client:

```bash
python mcp_server/server.py          # stdio (this is what .mcp.json runs for the vibe coder)
python mcp_server/server.py --http   # HTTP at http://127.0.0.1:8001/mcp
```

In Claude Code, `.mcp.json` registers it as **campus-customs**. Approve the project server when asked, and the 16 tools appear in the session.

### 3. Start the FastAPI backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The backend runs at http://localhost:8000, with interactive API docs at http://localhost:8000/docs. Leave this terminal open.

### 4. Start the React board

In a **second terminal**:

```bash
cd frontend
npm run dev
```

This opens the agent desk at http://localhost:5173. It calls the backend at `http://localhost:8000`, and the backend allows this origin through CORS.

### 5. Reset the database before a full three-ticket run

Before running all three tickets, reset the working copy so the run starts from the original data: $3,400 in checking, all tickets open, an empty board.

- **On the board:** click **↺ Reset shop** in the top bar.
- **Or with the backend stopped:** use the copy command from step 1.

The audit trail is kept, and each reset is recorded in it.

Then, for each ticket (101, 102, 103):
1. Select it on the **Ticket board**, click **Send #… to the team ▶**, and watch the agents in the shop window. A run takes about a minute.
2. When the ticket is stamped **RESOLVED**, open **Needs your OK**, type your name in **Signing as**, and click **Approve & pay** on each request the team filed. The checking balance drops after each approval.

Expected result from our run: $3,400.00 → $2,560.00 (#101, invoice 501) → $160.00 (#102, rent) → $160.00 (#103, no payment). See `output/desk_tickets.html`.

### Command-line alternative (from `backend/`)

```bash
python reset_db.py                                # reset the working DB
python run_tickets.py --ticket 101                # run one ticket
python run_tickets.py --all --reset               # reset, then run all open tickets
python approvals.py list                          # pending requests
python approvals.py approve 1 --by "Your Name"    # a human approves (this pays)
```

---

## Where to look

| File | What it holds |
|---|---|
| `output/harness.md` | The whole system: tables, MCP tools and the tables each uses, the five agents, owner policies, safety guardrails and token limits, API routes, the dashboard, and the Problem 9 results |
| `output/desk_tickets.html` | Per ticket, the Expected plan vs the Actual run; the Cash tab (start → each ticket → end, matching `cash_accounts`); the Reflection tab |
| `output/resolved_board.html` | Screenshots of the board after each ticket was resolved |
| `output/audit_trail.json` | Every agent loop step, tool call, hand-off and human decision |
| `AI_prompts.md` | Every prompt used to build this project, with a log of each reply |
