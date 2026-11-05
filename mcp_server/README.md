# Campus Customs MCP server

## What it is for
This is the shared toolbox for the Campus Customs multi-agent team. Every agent (Boss, Inventory, Accounting, Facilities, Customer Service) reads shop facts and makes every board write through these tools. The agents never write SQL themselves, and the backend has no second tools layer.

Each tool returns only what is in the database, or simple arithmetic on it (a shortfall, days overdue, a margin). If a record isn't found, the tool returns an `error` instead of guessing.

Built with [FastMCP](https://gofastmcp.com) in `server.py`. The vibe coder starts it over stdio from `.mcp.json`. The agent backend attaches the same server in-process with PydanticAI's `MCPToolset`, and gives each agent only the subset of tools its job needs.

## Database
- **Uses:** `data/campus_customs_new.db`, the working copy that tickets get resolved against. The `CAMPUS_CUSTOMS_DB` environment variable can point it at a scratch copy for tests.
- **Never touches:** `data/campus_customs.db`, the original. Copy it over the working copy to reset before a full run (`python backend/reset_db.py`).
- **"Today"** for every date check is `desk.date_today` (2026-08-31), not the computer clock.
- **Board tables.** The server adds three tables to the working copy if they are missing. A reset clears them.
  - `approval_requests`: payments and purchase orders waiting for a human
  - `drafts`: unsent messages
  - `ticket_updates`: ticket status changes with notes

## Tools (16)

### Read-only
| Tool | Reads | What it returns |
|---|---|---|
| `list_open_tickets(include_resolved=False)` | `tickets`, `desk` | Every ticket not yet resolved (or all tickets, for the dashboard) |
| `get_ticket(ticket_id)` | `tickets`, `invoices`, `vendors`, `leases`, `desk`, board tables | The ticket, its linked invoice (with vendor) or lease, and what is already on the board for it |
| `check_stock(sku, size, qty_needed=1)` | `inventory` | Units on hand, whether the order can be filled now, the shortfall, and stock in the other sizes |
| `list_vendors()` | `vendors`, `invoices`, `desk` | Each vendor's specialty, lead days, open invoices, `will_ship`, and ETA if ordered today |
| `check_vendor_invoices(vendor_id)` | `vendors`, `invoices`, `desk` | The vendor's open unpaid invoices with days overdue, `will_ship` (false while any invoice is open), lead days and ETA |
| `get_lease_rent_status(lease_id)` | `leases`, `desk` | Rent amount, landlord, next due date, days until due, and whether it is overdue |
| `get_cash_position(account="checking")` | `cash_accounts`, `approval_requests`, `payments`, `desk` | Balance, pending requests, the balance after all of them are approved, and payments already made |
| `check_price_margin(sku, discount_pct=0, qty=1)` | `pricing` | Unit price after the discount, unit margin, margin %, and order revenue, cost and profit |
| `quote_restock(vendor_id, sku, qty)` | `vendors`, `pricing`, `invoices`, `desk` | Estimated restock cost (qty × unit cost), lead days, ETA, and any blocking invoices |
| `list_board(ticket_id=None)` | `approval_requests`, `drafts`, `ticket_updates` | Everything on the board, or only one ticket's items |

### Writes by agents (nothing here moves money or sends anything)
| Tool | Writes | Notes |
|---|---|---|
| `request_payment(ticket_id, payment_type, ref_id, reason, requested_by)` | `approval_requests` | `"invoice"` or `"rent"`. The amount comes from the DB. Refuses duplicates, invoices that aren't open, and anything that would over-commit cash. Status: `pending`. |
| `request_purchase_order(ticket_id, vendor_id, sku, size, qty, reason, requested_by)` | `approval_requests` | Cost = qty × `pricing.unit_cost`. Allowed while the vendor is blocked, but approval waits until the vendor's invoice is paid. Status: `pending`. |
| `draft_message(ticket_id, recipient, recipient_type, subject, body, drafted_by)` | `drafts` | Saved as a draft only. A human sends it. |
| `update_ticket(ticket_id, status, note, updated_by)` | `tickets.status`, `ticket_updates` | Statuses: open, in_progress, waiting_on_approval, blocked, resolved. Never overwrites `tickets.notes`. |

| `withdraw_request(request_id, reason, withdrawn_by)` | `approval_requests` | Pending → `withdrawn`, so Accounting can reorder priorities when cash is short. Moves no money. |

The backend fills in `requested_by`, `drafted_by`, `updated_by` and `withdrawn_by` with the agent that actually made the call.

### Human only
| Tool | Writes | Notes |
|---|---|---|
| `decide_approval(request_id, decision, approver, note="")` | `payments`, `cash_accounts`, `invoices` or `leases`, `approval_requests` | No agent is given this tool. It refuses an empty approver or an agent's name. |

On approval, `decide_approval` refuses if the cash balance would go negative or below the $100 reserve, and refuses a purchase order while its vendor has an open invoice. Otherwise it does the following in one transaction:
- writes the `payments` row (`paid_at` = shop today, `approved_by` = the person)
- lowers the cash balance
- marks the invoice `paid`, moves the lease's `next_due` forward one month, or sets the purchase order's `expected_arrival` (shop today + the vendor's lead days)

On rejection, only the request is marked `rejected`.

## Owner policies built into the tools
Set by the shop owner on 2026-11-05. They are the `OWNER POLICY` constants in `server.py`.
- **Discounts:** never more than 20% off list, and never below a 50% margin. `check_price_margin` reports `within_policy`, `policy_problems` and `policy_max_discount_pct`.
- **Cash reserve:** at least $100 at all times. The request tools and `decide_approval` refuse anything that would break it, and `get_cash_position` reports `spendable_after_pending`.
- **Rent:** never more than 30 days past due. `get_lease_rent_status` reports `policy_latest_pay_date` and `policy_breached`.

## Running it
```bash
pip install fastmcp
python server.py          # stdio (this is what .mcp.json runs)
python server.py --http   # http://127.0.0.1:8001/mcp
```
The vibe coder only loads new tools when a session starts, so restart the session after changing this file.
