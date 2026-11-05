# Campus Customs Multi-Agent Operations — Harness

This is the full harness for the Campus Customs agent team, covering data, tools, agents, routes, dashboard, safety and results.

| Section | Covers |
|---|---|
| §0–§3 | **Data:** files, every table and its fields, how they link, the three tickets |
| §4, §6 | **MCP tools:** the first three (Problem 3); all 16, with the tables each reads or writes and the rules enforced in code |
| §5 | **The five agents:** roles, prompts, tools, delegation, agent loop, audit trail |
| §7 | **Owner policies:** discounts, payment priority, $100 reserve, message voice |
| §8 | **Safety rules:** guardrails for real customers and real money; token limits |
| §9 | **API routes** (FastAPI, `backend/main.py`) |
| §10 | **The dashboard** (React, `frontend/`) |
| §11 | **Problem 9 full run:** results, cash, output files |

**How to run it:**
1. In `backend/`: `uvicorn main:app --reload --port 8000`
2. In `frontend/`: `npm run dev`, which opens http://localhost:5173
3. Click **Reset shop** before a full run.

## 0. Data files

| File | Role |
|---|---|
| `data/campus_customs.db` | Original shop database. **Never written to.** It is the reset source. |
| `data/campus_customs_new.db` | Working copy that the MCP server and backend read and write. To reset, copy the original over it before a full run. |

When first copied (2026-11-05), the working copy was byte-for-byte identical to the original (53,248 bytes each). Since Problem 5, the MCP server also adds the three board tables to the working copy (§6). The original is never opened for writing.

## 1. Tables

### desk
| Field | Type |
|---|---|
| date_today | TEXT, not null |
| notes | TEXT |

**Why it matters:** `date_today` (2026-08-31) is "today" for the shop. Every agent uses it to decide what is overdue or due soon, never the real clock.

### tickets
| Field | Type |
|---|---|
| id | INTEGER, PK |
| type | TEXT, not null (`customer_order`, `rent_notice`, `price_override`) |
| requester | TEXT, not null |
| subject | TEXT, not null |
| sku | TEXT (soft link to inventory/pricing) |
| size | TEXT |
| qty | INTEGER |
| lease_id | INTEGER, FK → leases.id |
| invoice_id | INTEGER, FK → invoices.id |
| status | TEXT, not null (`open`) |
| notes | TEXT |
| created_at | TEXT (ISO timestamp), not null |

**Why it matters:** The work board. The Boss reads each open ticket, and its `type` plus link fields (sku/size/qty, lease_id, invoice_id) tell the Boss which agents to route it to.

### inventory
| Field | Type |
|---|---|
| sku | TEXT, PK part 1 |
| name | TEXT, not null |
| size | TEXT, PK part 2 (`S`/`M`/`L`/`XL`, or `OS` = one size) |
| qty | INTEGER, not null |
| location | TEXT, not null (aisle) |

**Why it matters:** The Inventory agent checks stock by (sku, size) here to spot shortfalls. There is no vendor column, so the restock vendor has to be matched through `vendors.specialty`.

### pricing
| Field | Type |
|---|---|
| sku | TEXT, PK |
| unit_cost | REAL, not null |
| list_price | REAL, not null |

**Why it matters:** Accounting uses cost against list price to check margins on discount requests and to price purchase orders. It's priced per SKU, not per size.

### vendors
| Field | Type |
|---|---|
| id | INTEGER, PK |
| name | TEXT, not null |
| specialty | TEXT, not null |
| lead_days | INTEGER, not null |

**Why it matters:** Inventory picks the restock vendor by specialty and computes the ETA as `date_today` + `lead_days`. A vendor with an open unpaid invoice will not ship.

### leases
| Field | Type |
|---|---|
| id | INTEGER, PK |
| space_name | TEXT, not null |
| landlord | TEXT, not null |
| monthly_rent | REAL, not null |
| next_due | TEXT (date), not null |
| notes | TEXT |

**Why it matters:** Facilities' table. It holds the rent amount and due date to compare against `date_today`. After rent is paid, `next_due` should move forward one month.

### cash_accounts
| Field | Type |
|---|---|
| name | TEXT, PK (`checking`) |
| balance | REAL, not null |
| date | TEXT, not null |

**Why it matters:** The only source of cash, and money only goes out. The pay tool must refuse any payment that would make the balance negative.

### payments
| Field | Type |
|---|---|
| id | INTEGER, PK |
| kind | TEXT, not null (e.g. invoice / rent) |
| ref_id | INTEGER (invoice id or lease id, depending on `kind`; no FK) |
| amount | REAL, not null |
| account | TEXT, not null (→ cash_accounts.name) |
| paid_at | TEXT, not null |
| approved_by | TEXT, not null |

**Why it matters:** The audit log of money out, empty at the start. Every row needs a human in `approved_by`, and writing one must also update the cash balance and the related invoice or lease in the same step.

### invoices
| Field | Type |
|---|---|
| id | INTEGER, PK |
| vendor_id | INTEGER, FK → vendors.id |
| amount | REAL, not null |
| due_date | TEXT (date), not null |
| status | TEXT, not null (`open`) |
| description | TEXT |

**Why it matters:** Bills the shop owes. An `open` invoice past its `due_date` is overdue and blocks that vendor from shipping until a human-approved payment marks it paid.

## 2. How the tables link

```
tickets.invoice_id ──FK──▶ invoices.id ──FK (vendor_id)──▶ vendors.id
tickets.lease_id   ──FK──▶ leases.id
tickets.sku/size   ──soft──▶ inventory(sku, size), pricing(sku)
payments.ref_id    ──soft──▶ invoices.id or leases.id (chosen by payments.kind)
payments.account   ──soft──▶ cash_accounts.name
inventory ⟷ vendors: no link; match by vendors.specialty
```

## 3. The three open tickets (today = 2026-08-31, cash = $3,400)

### #101 customer_order — Tauhid Zaman, "Bulldog tee"
- **Asks for:** 1 × CC-TEE-WHITE, size S ("Needs a tee in size S.").
- **inventory:** CC-TEE-WHITE S = **0** (M 5, L 3, XL 2), Aisle B → shortfall of 1.
- **pricing:** cost $8, list $28.
- **invoice_id → 501:** Bulldog Print Co, $840, due 2026-08-28, `open`, "Rush reprint CC-TEE-WHITE S" → **3 days overdue**.
- **vendor 1:** Bulldog Print Co, apparel reprint, 5 lead days. It won't ship while 501 is open.
- **Agents involved:** Inventory (shortfall, vendor), Accounting (pay 501 after human approval), Customer Service (draft ETA message), Boss (final call).

### #102 rent_notice — Elm City Properties, "Rent due"
- **Asks for:** rent payment ("Email: shop rent due in 2 days.").
- **lease_id → 1:** Chapel Street shop, $2,400/month, next_due **2026-09-02** → due in 2 days, not overdue.
- **Agents involved:** Facilities (lease), Accounting (pay after human approval, check cash), Boss.

### #103 price_override — Yale AI Club, "Bulk hoodie discount"
- **Asks for:** 20 × CC-HOOD-NAVY, size M, at a bulk discount.
- **inventory:** CC-HOOD-NAVY M = **8** (S 4, L 14, XL 6), Aisle A → shortfall of 12.
- **pricing:** cost $22, list $58 → 62% margin at list.
- **Restock vendor:** Bulldog Print Co (apparel), the same vendor blocked by invoice 501.
- **Agents involved:** Inventory (shortfall, vendor), Accounting (margin on the discount, purchase-order cost), Customer Service (draft reply), Boss (approve or deny the discount).

### Links across tickets
- **Invoice 501 blocks both #101 and #103**, because both need apparel from Bulldog Print Co.
- **All three compete for $3,400.** Invoice 501 ($840) plus rent ($2,400) leaves $160, which can't cover a 12-hoodie restock (12 × $22 = $264).

## 4. MCP tools (`mcp_server/server.py`, FastMCP, working DB `data/campus_customs_new.db`)

*The first three tools, from Problem 3. §6 lists all 16 tools as of Problem 5.*

The server is shared by all agents. Every tool returns only database values or arithmetic on them, and returns an `error` when a SKU, size, vendor or lease is not found, instead of guessing. "Today" always comes from `desk.date_today`.

| # | Tool | Tables it reads | Ticket it unlocks | Why it is the right tool for that ticket |
|---|---|---|---|---|
| 1 | `check_stock(sku, size, qty_needed)` | `inventory` | **103** (also 101) | Ticket 103 asks for 20 × CC-HOOD-NAVY size M, and this tool looks up exactly that (sku, size) row: it returns 8 on hand and a **shortfall of 12**, plus 14 in L and 6 in XL. That tells the Boss the AI Club can't be fully served from the shelf before anyone talks about a discount. For #101 it shows tee S = 0, short 1. |
| 2 | `check_vendor_invoices(vendor_id)` | `vendors`, `invoices`, `desk` | **101** (also blocks 103) | Ticket 101's `invoice_id` is 501, owed to vendor 1. This tool shows Bulldog Print Co has invoice 501 ($840) **open and 3 days overdue** against `desk.date_today`, so `will_ship = false`. That is why the size S tee can't be restocked until a human approves paying 501. Once it is paid, the tool gives the 5-day lead time for the customer's ETA. |
| 3 | `get_lease_rent_status(lease_id)` | `leases`, `desk` | **102** | Ticket 102 is a landlord email saying rent is "due in 2 days". This tool checks the claim against lease 1 itself: $2,400 to Elm City Properties, `next_due` 2026-09-02, **2 days left, not overdue**. Facilities and Accounting then schedule the payment from the lease record, not from the email text. |

**Checked on 2026-11-05** by calling each function directly against the working DB. Results matched §3: hoodie M 8/short 12; tee S 0/short 1; vendor 1 blocked by invoice 501, 3 days overdue; vendor 2 not blocked, ETA 2026-09-03; lease 1 due in 2 days. Unknown SKUs, sizes, vendors and leases return errors. The DB was byte-identical to the original afterwards. The MCP server itself has not been run or connected yet.

## 5. The agent team (Problem 5, `backend/`)

PydanticAI 2.49. Every agent runs **gpt-6-luna** through Portkey with the OpenAI SDK, using `PORTKEY_API_KEY` from the course `.env`. Each agent's prompt is one file in `backend/prompts/`. Data types are in `backend/models.py`, and each role is defined in its own file under `backend/agents/`. The loop, delegation and audit code is in `backend/agents/team.py`.

| Agent | Prompt | Job | MCP tools it can use (least privilege) |
|---|---|---|---|
| **Boss** | `prompts/boss.md` | Reads each ticket, routes work, makes the final calls (discount, priority when cash is short), sets ticket status | `list_open_tickets`, `get_ticket`, `list_board`, `get_cash_position`, `check_price_margin`, `update_ticket` |
| **Inventory** | `prompts/inventory.md` | Stock by SKU and size, shortfalls, restock vendor matched by specialty, blockers and ETA | `get_ticket`, `check_stock`, `list_vendors`, `check_vendor_invoices`, `quote_restock`, `list_board` |
| **Accounting** | `prompts/accounting.md` | Cash, invoices, margins; **the only agent that can file** payment and purchase-order requests (for human approval) | `get_ticket`, `get_cash_position`, `check_vendor_invoices`, `get_lease_rent_status`, `check_price_margin`, `quote_restock`, `list_board`, `request_payment`, `request_purchase_order`, `withdraw_request` |
| **Facilities** | `prompts/facilities.md` | Lease, rent, due dates; checks landlord claims against the lease | `get_ticket`, `get_lease_rent_status`, `get_cash_position`, `list_board` |
| **Customer Service** | `prompts/customer_service.md` | Turns decisions into customer messages, saved as **drafts only** | `get_ticket`, `check_stock`, `list_board`, `draft_message` |

**Full connectivity:** every agent also has a `delegate(to_agent, task)` tool and may hand work to any of the other four, including back up to the Boss. The delegated agent runs its own loop and returns a structured `AgentReport` (status, summary, facts with the tool each came from, actions, request and draft ids, recommendations, open questions). The Boss ends a ticket with a `TicketOutcome`.

**Agent loop:** each agent is driven with `Agent.iter()`. Each step works like this: the model reads its context and calls MCP tools or `delegate` (several at once when they are independent), then reads the results, and so on until it returns its structured report.

**Audit trail:** `output/audit_trail.json` is a JSON list, and entries are **only appended, never wiped**. Each step is written as it happens:

| Event | What it records |
|---|---|
| `ticket_run_start` / `ticket_run_end` | trace id, limits in force, outcome, total token use, seconds |
| `agent_run_start` / `agent_run_end` | which agent, who delegated, the brief, its tools, its report, status, seconds |
| `model_step` | step number, the model's reasoning summary and text, each tool call with its arguments, tokens for that step |
| `tool_results` | what each tool returned (long results cut to 1,500 characters) and whether it errored |
| `delegation_refused` | a blocked hand-off and why (self, cycle, depth, budget) |
| `human_decision` / `db_reset` | a person approving or rejecting a request; a reset of the working DB |

Every entry carries `trace_id` (one per ticket run), `run_id`, `parent_run_id`, `agent`, `depth` and `ticket_id`, so any step can be traced back to the Boss's decision that caused it.

**How to run** (from `backend/`): `python run_tickets.py --ticket 102`, or `python run_tickets.py --all --reset` for a full run starting from a reset database. Human approvals until the dashboard exists: `python approvals.py list`, then `python approvals.py approve <id> --by "<your name>"`.

## 6. MCP tools (all 16, `mcp_server/server.py`)

All shop facts and every write go through this MCP server; the backend has no separate tools layer. Agents attach it in-process with PydanticAI's `MCPToolset`, the same server `.mcp.json` runs for the vibe coder. Each agent sees only its allowed subset. The `requested_by` / `drafted_by` / `updated_by` fields are hidden from the model and filled in by the backend with the agent that actually made the call.

**New board tables.** The server creates these in the working copy if they are missing. A reset clears them.
- `approval_requests`: payments and purchase orders waiting for a human
- `drafts`: unsent messages
- `ticket_updates`: status changes with notes; `tickets.notes` is never overwritten

| # | Tool | Tables (R = reads, W = writes) | Used by | Added in |
|---|---|---|---|---|
| 1 | `list_open_tickets(include_resolved)` | R `tickets`, `desk` | Boss (and the `/api/tickets` route) | P5 |
| 2 | `get_ticket(ticket_id)` | R `tickets`, `invoices`, `vendors`, `leases`, `desk`, `approval_requests`, `drafts`, `ticket_updates` | all | P5 |
| 3 | `check_stock(sku, size, qty_needed)` | R `inventory` | Inventory, Customer Service | P3 |
| 4 | `list_vendors()` | R `vendors`, `invoices`, `desk` | Inventory | P5 |
| 5 | `check_vendor_invoices(vendor_id)` | R `vendors`, `invoices`, `desk` | Inventory, Accounting | P3 |
| 6 | `get_lease_rent_status(lease_id)` | R `leases`, `desk` | Facilities, Accounting | P3 |
| 7 | `get_cash_position(account)` | R `cash_accounts`, `approval_requests`, `payments`, `desk` | Boss, Accounting, Facilities | P5 |
| 8 | `check_price_margin(sku, discount_pct, qty)` | R `pricing` | Boss, Accounting | P5 |
| 9 | `quote_restock(vendor_id, sku, qty)` | R `vendors`, `pricing`, `invoices`, `desk` | Inventory, Accounting | P5 |
| 10 | `list_board(ticket_id)` | R `approval_requests`, `drafts`, `ticket_updates` | all | P5 |
| 11 | `request_payment(ticket_id, payment_type, ref_id, reason)` | W `approval_requests`; R `tickets`, `invoices`, `leases`, `cash_accounts` | Accounting | P5 |
| 12 | `request_purchase_order(ticket_id, vendor_id, sku, size, qty, reason)` | W `approval_requests`; R `tickets`, `vendors`, `inventory`, `pricing`, `invoices`, `cash_accounts` | Accounting | P5 |
| 13 | `draft_message(ticket_id, recipient, recipient_type, subject, body)` | W `drafts`; R `tickets` | Customer Service | P5 |
| 14 | `update_ticket(ticket_id, status, note)` | W `tickets.status`, `ticket_updates` | Boss | P5 |
| 15 | `withdraw_request(request_id, reason)` | W `approval_requests` (pending → withdrawn; moves no money) | Accounting | P5 |
| 16 | `decide_approval(request_id, decision, approver, note)` | W `payments`, `cash_accounts`, `invoices` or `leases`, `approval_requests`; R `vendors`, `desk` | **human only** (no agent has it) | P5 |

**How the shop rules are enforced in the tools, not only in the prompts:**

| Rule | Enforcement |
|---|---|
| Amounts come from the DB | Invoice amount, monthly rent, or qty × `pricing.unit_cost`. The caller never sets them. |
| Human approval | Agents can only create `pending` requests. Only `decide_approval` moves money, and it refuses an empty approver or an agent's name. |
| No negative balance, $100 reserve | Requests are refused if pending + new would leave less than the $100 reserve, and `decide_approval` re-checks both before paying. |
| Vendor blocked by open invoice | `decide_approval` refuses a purchase order while that vendor has an open invoice. |
| Paying updates the related tables | One transaction inserts the `payments` row, lowers `cash_accounts.balance` and sets its `date`, then: invoice → `paid`; rent → `leases.next_due` + 1 month; purchase order → `expected_arrival` = today + `lead_days`. |
| No duplicates | A second pending request for the same invoice, lease, or vendor + SKU + size is refused. |

> **Decided by the owner (2026-11-05), closing the question parked in Problem 2:** a purchase order is paid when the human approves it (cash out, using `pricing.unit_cost` as the vendor price), not turned into a new invoice. Stock is not increased on approval, because the goods arrive `lead_days` later.

## 7. Owner policies (decided by the shop owner, 2026-11-05)

These are not in the database. They are written into the prompts (`boss.md`, `accounting.md`, `facilities.md`, `customer_service.md`), and wherever possible also enforced in the MCP tools (`OWNER POLICY` constants in `server.py`).

| Policy | The owner's answer | Where it lives |
|---|---|---|
| Purchase orders | Treated as paid when a human approves them | `decide_approval` (code) |
| Discount limits | Never more than 20% off, never below a 50% margin (both must hold) | `check_price_margin` returns `within_policy` and `policy_max_discount_pct` (code); Boss and Accounting prompts |
| Discount tiers | None: no dependence on quantity or on who the customer is | Boss and Accounting prompts |
| Partial orders | No discount on a partial order; the available part is sold at list price | Boss and Customer Service prompts |
| Payment priority | Rent → overdue vendor bills → restocks for customer orders → other restocks. Serving customers comes first, but rent can never be more than 30 days past due. | Boss, Accounting and Facilities prompts; `get_lease_rent_status` returns `policy_latest_pay_date` (code); `withdraw_request` lets Accounting reorder (code) |
| Cash reserve | Keep at least $100 | Request tools and `decide_approval` refuse below it (code); `get_cash_position` returns `spendable_after_pending` |
| Voice | Yale spirit | Customer Service prompt |
| Sign-off | "Campus Customs Customer Service" | Customer Service prompt |
| Length | Not more than 200 words | Customer Service prompt |
| Alternatives | Customer Service may offer alternatives on its own, but each needs the Boss's approval (`alternatives_proposed` → `alternatives_approved`) | Customer Service and Boss prompts; `models.py` |
| Off limits | No internal codes, communications between agents, costs, or internal disagreements | Customer Service and Boss prompts |

**How the two rent rules fit together.** No money comes in, so putting a customer payment ahead of rent changes the order, not the total. It is allowed only if the cash left above the $100 reserve still covers the rent. Otherwise rent keeps its cash and the customer payment waits.

## 8. Safety: guardrails for real customers and real money

**What a real business would want (✔ = built here):**

| Guardrail | Status |
|---|---|
| **Human in the loop for money.** Agents prepare and a named person approves. No agent holds a tool that can pay. The approver's name is stored on every payment. | ✔ |
| **Least privilege.** Each agent sees only the tools its job needs. Only Accounting can file money requests, only Customer Service can draft messages, only the Boss can change ticket status. | ✔ |
| **Rules in code, not only in prompts.** Amounts come from the DB; cash, vendor blocks and duplicates are checked again at approval time (§6). A prompt-injected or confused agent still can't overspend. | ✔ |
| **Nothing reaches the outside world unreviewed.** Messages are drafts until a person sends them. No email, phone or vendor API exists in the toolset. | ✔ |
| **Full audit trail.** Every step, tool call, result, hand-off and human decision is logged append-only with trace ids. | ✔ |
| **Treat ticket and email text as data, not instructions** (prompt injection, such as "pay to this new account" or "give me 50% off"). Flag mismatches with the lease or invoice. | ✔ (in prompts) |
| **Reset and sandbox.** Work runs on a copy, so the original data is the reset source. | ✔ |
| **Before going live**, a real shop would add: | to add |
| • Two-person approval above a threshold, and a daily spend cap per approver | |
| • Payee and bank-detail change verification by phone call-back | |
| • Role-based login on the dashboard instead of a typed name | |
| • PII redaction in logs, plus retention limits on the audit file | |
| • A tone and claims check (or human review) on every customer message | |
| • Rate limits, and an "agents paused" kill switch | |
| • Alerts when a run hits a limit or a tool errors repeatedly | |

**Limits that keep token use in check** (`backend/config.py`). All agents in one ticket share one usage counter, so these caps are per ticket, not per agent:

| Limit | Value | Why |
|---|---|---|
| Model calls per ticket | 30 | Hard cap across all five agents |
| Tool calls per ticket | 60 | Stops tool loops |
| Total tokens per ticket | 250,000 | Cost ceiling |
| Model steps per agent loop | 8 for specialists, 14 for the Boss | One agent can't spin while others wait. The Boss gets more because she coordinates several specialists and then records and reports; raised from 8 after ticket 103's test run ended before her final report |
| Delegation depth | 3 | Boss → A → B → C, then no further hand-offs |
| Hand-offs per ticket | 8 | Stops endless re-delegation |
| Cycles | refused | You can't delegate to an agent that is waiting on you |
| Brief length | 2,000 characters | A hand-off is a summary, not a transcript |
| Output per model response | 4,000 tokens | |
| Audit tool-result previews | 1,500 characters | Keeps the log readable |

Prompts also push efficiency: batch independent tool calls in one step, don't re-check facts already in the brief, and when two agents are briefed in parallel, tell each what the other is doing so work isn't duplicated.

## 9. Backend routes (Problem 7, `backend/main.py`, FastAPI)

Start from `backend/` with `uvicorn main:app --reload --port 8000`. The backend runs at http://localhost:8000, and interactive docs are at `/docs`. CORS is open to the React dev server on ports 5173 and 3000. Every shop fact and every change goes through the campus-customs MCP tools.

- `GET  /api/health`: backend status, the model in use, and whether a team run is in progress.
- `GET  /api/tickets`: every ticket, each marked `open`, `running` or `resolved`. A ticket counts as resolved once the team has finished a run on it since the last reset. The response also includes the Boss's detailed status, the last run, and counts of pending approvals and drafts.
- `GET  /api/tickets/{ticket_id}/summary`: what each agent did on the ticket's latest run: their report, the tools they used, their hand-offs, and the Boss's final call (added in Problem 8 for the dashboard).
- `POST /api/tickets/{ticket_id}/run`: runs the agent team on one ticket. It returns a `trace_id` right away (add `?wait=true` to wait for the result). Only one run happens at a time.
- `GET  /api/runs/{trace_id}`: whether that team run is still running, done or errored, and its `TicketOutcome`.
- `GET  /api/events`: recent agent events from `output/audit_trail.json`, showing what each agent said and which tools it used (filters: `limit`, `after_seq`, `ticket_id`, `trace_id`, `agent`). The board polls it to refresh.
- `GET  /api/approvals`: payment and purchase-order requests the agents prepared (`?status=pending` by default).
- `POST /api/approvals/{request_id}/approve`: a human clicked Approve, with body `{"approver": "<name>", "note": ""}`. **This is the only route that changes cash.** It pays through the human-only MCP tool `decide_approval`, and returns 409 if a rule blocks the payment (cash, the $100 reserve, a blocked vendor, an agent's name as approver).
- `POST /api/approvals/{request_id}/reject`: a human rejected the request. No money moves.
- `GET  /api/board`: everything the agents left on the board: approval requests, message drafts, ticket updates (optional `?ticket_id=`).
- `GET  /api/cash`: the current checking balance from `cash_accounts`, plus pending requests, the reserve, and payments made.
- `POST /api/reset`: resets the working DB to the original values for a fresh run. It clears the board, keeps the audit trail, and is refused while a run is in progress.

## 10. Agent dashboard (Problem 8, `frontend/`, React + Vite + TypeScript)

Start it from `frontend/` with `npm run dev`; it opens http://localhost:5173. It calls the backend directly at **http://localhost:8000** (`src/api.ts`; override with `VITE_API_BASE`), and the backend's CORS allows `http://localhost:5173`. The design choices are explained in `output/design.md`.

- **Left, the interaction table:** the ticket board (pick a ticket and send it to the team; a RESOLVED stamp appears when the run ends), **Needs your OK** (approve or reject the payments and purchase orders the agents prepared; Approve is the only button that moves cash), and **What the team did** (the Boss's call, one row per agent, and the message drafts).
- **Right, the shop window:** the five agents as cartoon characters at their desks with nameplates, plus speech bubbles, mood badges, tool chips, and letters flying between desks for each hand-off and report. It's a spring scene, with Evans Hall among the Yale buildings in the distance, and Labubu strolling by now and then to peek in.
- **Desk log:** a colour-coded transcript from `/api/events`.
- **Cash:** the checking balance in the top bar counts down when a payment is approved. Accounting's register in the shop shows the same balance. The sidewalk chalkboard shows TODAY, the shop's date and WELCOME IN!

## 11. Problem 9: full run of the three tickets

**Run order:**
1. Reset the working DB at 2026-11-05 21:16:52 UTC.
2. Ran #101, #102 and #103 one at a time through `POST /api/tickets/{id}/run`, using gpt-6-luna.
3. After each run, the human approved the requests in the dashboard's **Needs your OK**.
4. Every agent loop step was appended to `output/audit_trail.json`: 104 entries for this run, including 3 ticket runs, 11 agent loops and 2 human decisions.

| Ticket | Agents who worked | Human approvals | Outcome |
|---|---|---|---|
| #101 Bulldog tee | Bea, Ivan, Abe, Cece | Pay invoice 501 $840.00 paid by Carl Breau | Wait for owner approval of the $840 vendor invoice payment request. The customer draft is ready and approved to offer a size M white tee for $28 now, or to wait for size S with timing to be confirmed; after invoice approval, arrange a one-unit restock PO for separate approval. |
| #102 Rent due | Bea, Fay, Abe | Pay rent, lease 1 $2,400.00 paid by Carl Breau | Rent payment request #2 for $2,400 is filed and awaiting the owner's approval. The rent is due 2026-09-02; it has not been paid. |
| #103 Bulk hoodie discount | Bea, Ivan, Abe, Cece | none | Do not grant a bulk discount because all 20 cannot currently be supplied. Approve offering the 8 in-stock size M hoodies at the $58 regular unit price; draft 2 is ready for the human to send, and no date is promised for the remaining 12. |

**Cash** (checking, from `cash_accounts`):

| Step | Change | Balance |
|---|---|---|
| Start, after the reset | | **$3,400.00** |
| #101: invoice 501 paid | −$840.00 | $2,560.00 |
| #102: rent for lease 1 paid; `next_due` → 2026-10-02 | −$2,400.00 | $160.00 |
| #103: no payment (restock of $264 not affordable above the $100 reserve) | $0.00 | $160.00 |
| End | | **$160.00** ✓ |

The end balance matches `cash_accounts` in the working DB.

**Rule check after the run:** a read-only checker passed 75 of 75 checks. It covered:
- **Money:** no negative balance; the $100 reserve kept; balance = start − payments; every payment approved by a human and backed by an approved request; amounts taken from the DB.
- **Records:** the invoice and lease updated correctly; requests filed only by Accounting, drafts only by Customer Service, ticket updates only by the Boss.
- **Drafts:** at most 200 words; the correct sign-off; no SKU codes.
- **Agents:** each used only its own tools; no agent called `decide_approval`; delegation depth and hand-off limits were respected; every run stayed within its token limits.
- **Audit trail:** append-only, with every run and loop opened and closed.

**Output files:**

| File | What it holds |
|---|---|
| `output/desk_tickets.html` | One tab per ticket comparing the **Expected** plan from Problem 6 (kept as written) with the **Actual** run: agents, delegations in order, tools by agent, reports, approvals, cash change. Plus the **Cash** tab with the itemised ledger above. |
| `output/resolved_tickets.json` | Per ticket: id, final status, short outcome, what each agent contributed, human approvals, drafts, and run stats. |
| `output/resolved_board.html` | A self-contained page with a screenshot of the React board after each ticket was resolved. |
| `output/audit_trail.json` | Every step of every run, appended and never wiped. |

