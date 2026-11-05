"""Campus Customs MCP server: shared shop tools for every agent on the team.

All tools work on the WORKING COPY data/campus_customs_new.db (override with the
CAMPUS_CUSTOMS_DB environment variable, e.g. for tests on a scratch copy). The original
data/campus_customs.db is never opened here; it is only the reset source.

Every value a tool returns comes from the database (or is arithmetic on database
values, such as a shortfall or days until due). If a row is not found, the tool
returns an "error" instead of guessing.

Money rules enforced in code (not just in prompts):
  * Agents can only REQUEST a payment or purchase order (status "pending").
  * Only decide_approval() moves money, and it needs a named human approver.
  * decide_approval() refuses if the cash account would go negative, and refuses a
    purchase order while that vendor still has an open unpaid invoice.
  * Cash only goes out: no tool ever adds money to an account.
  * Owner policy: the checking balance never drops below MIN_CASH_RESERVE ($100), counting
    every pending request, at request time and again at approval time.

Owner policies (set by the shop owner on 2026-11-05, see OWNER POLICY below):
  * Discounts: never more than 20% off list, and never below a 50% margin (both must hold).
  * Keep a minimum cash reserve of $100.
  * Rent may never be more than 30 days past its due date.

The "board" (approval requests, drafts, ticket updates) lives in three extra tables
that this server creates in the working copy if they are missing. Resetting (copying
the original over the working copy) clears the board too.

Run (stdio):  python server.py
Run (HTTP):   python server.py --http   ->  http://127.0.0.1:8001/mcp
"""

from __future__ import annotations

import argparse
import calendar
import os
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastmcp import FastMCP

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DB_PATH = Path(os.getenv("CAMPUS_CUSTOMS_DB", ROOT / "data" / "campus_customs_new.db"))

# Agent names may never approve money; approvals must come from a person.
AGENT_NAMES = {"boss", "inventory", "accounting", "facilities", "customer_service", "customer service"}
TICKET_STATUSES = ("open", "in_progress", "waiting_on_approval", "blocked", "resolved")

# ---- OWNER POLICY (decided by the shop owner; not in the database) ----
MAX_DISCOUNT_PCT = 20.0        # never more than 20% off list price
MIN_MARGIN_PCT = 50.0          # never below a 50% margin on the discounted price
MIN_CASH_RESERVE = 100.0       # cash may never be committed below this balance
RENT_MAX_DAYS_PAST_DUE = 30    # rent may never be more than 30 days past due

mcp = FastMCP("campus-customs")


# ---------------------------------------------------------------- helpers

BOARD_SCHEMA = """
CREATE TABLE IF NOT EXISTS approval_requests (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id        INTEGER,
    request_type     TEXT NOT NULL,      -- invoice | rent | purchase_order
    ref_id           INTEGER,            -- invoice id (invoice), lease id (rent), NULL (purchase_order)
    vendor_id        INTEGER,
    sku              TEXT,
    size             TEXT,
    qty              INTEGER,
    amount           REAL NOT NULL,
    account          TEXT NOT NULL,
    reason           TEXT NOT NULL,
    requested_by     TEXT NOT NULL,
    requested_at     TEXT NOT NULL,
    status           TEXT NOT NULL,      -- pending | paid | rejected | withdrawn
    decided_by       TEXT,
    decided_at       TEXT,
    decision_note    TEXT,
    payment_id       INTEGER,
    expected_arrival TEXT
);
CREATE TABLE IF NOT EXISTS drafts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id      INTEGER,
    recipient      TEXT NOT NULL,
    recipient_type TEXT NOT NULL,        -- customer | vendor | landlord
    subject        TEXT NOT NULL,
    body           TEXT NOT NULL,
    drafted_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS ticket_updates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL,
    status     TEXT NOT NULL,
    note       TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _connect(readonly: bool = True) -> sqlite3.Connection:
    """Open the working DB. Read tools use read-only mode so they cannot change data."""
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Working database not found at {DB_PATH}. "
            "Copy data/campus_customs.db to data/campus_customs_new.db first."
        )
    _ensure_board_tables()
    uri = f"file:{DB_PATH.as_posix()}" + ("?mode=ro" if readonly else "")
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_board_tables() -> None:
    """Create the board tables in the working copy if they are missing (e.g. after a reset)."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.executescript(BOARD_SCHEMA)


def _shop_today(conn: sqlite3.Connection) -> date:
    """The shop's "today" is desk.date_today, never the computer clock."""
    row = conn.execute("SELECT date_today FROM desk LIMIT 1").fetchone()
    if row is None:
        raise ValueError("desk table has no date_today row.")
    return date.fromisoformat(row["date_today"])


def _now() -> str:
    """Wall-clock time, used only to timestamp board records (not for business dates)."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _add_month(d: date) -> date:
    """Same day next month (clamped to the month's last day, e.g. Jan 31 -> Feb 28)."""
    year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def _rows(cursor) -> list[dict]:
    return [dict(r) for r in cursor.fetchall()]


def _open_invoices(conn: sqlite3.Connection, vendor_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT id, amount, due_date, status, description FROM invoices "
        "WHERE vendor_id = ? AND status = 'open' ORDER BY due_date",
        (vendor_id,),
    ).fetchall()


def _pending_total(conn: sqlite3.Connection, account: str) -> float:
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM approval_requests "
        "WHERE status = 'pending' AND account = ?",
        (account,),
    ).fetchone()
    return round(row["total"], 2)


def _ticket_exists(conn: sqlite3.Connection, ticket_id: int | None) -> bool:
    return ticket_id is None or conn.execute(
        "SELECT 1 FROM tickets WHERE id = ?", (ticket_id,)
    ).fetchone() is not None


def _clean_name(name: str) -> str:
    return " ".join((name or "").split())


# ================================================================ READ TOOLS

@mcp.tool
def list_open_tickets(include_resolved: bool = False) -> dict:
    """List every ticket on the board that is not resolved yet (id, type, requester,
    subject, status, created_at), oldest first. With include_resolved=True, list all
    tickets, resolved ones included (the dashboard uses this).

    Reads the tickets table. The Boss starts here to see the work queue.

    Args:
        include_resolved: Also return tickets whose status is "resolved" (default False).
    """
    where = "" if include_resolved else "WHERE status != 'resolved' "
    with closing(_connect()) as conn:
        rows = _rows(conn.execute(
            "SELECT id, type, requester, subject, sku, size, qty, lease_id, invoice_id, status, notes, created_at "
            f"FROM tickets {where}ORDER BY created_at"
        ))
        today = _shop_today(conn)
    return {"shop_today": today.isoformat(), "open_tickets": rows, "count": len(rows)}


@mcp.tool
def get_ticket(ticket_id: int) -> dict:
    """Get one ticket with the records it links to and everything already on the board
    for it.

    Reads tickets, plus the linked invoices row (with its vendor from vendors), the linked
    leases row, and the board tables (approval_requests, drafts, ticket_updates). Every
    agent should call this first so it works from the ticket itself, not a paraphrase.

    Args:
        ticket_id: The ticket's id, e.g. 101.
    """
    with closing(_connect()) as conn:
        ticket = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if ticket is None:
            return {"error": f"No ticket with id {ticket_id} in the tickets table."}
        ticket = dict(ticket)
        today = _shop_today(conn)
        linked: dict = {}
        if ticket["invoice_id"] is not None:
            inv = conn.execute(
                "SELECT i.id, i.vendor_id, v.name AS vendor_name, i.amount, i.due_date, "
                "i.status, i.description FROM invoices i JOIN vendors v ON v.id = i.vendor_id "
                "WHERE i.id = ?",
                (ticket["invoice_id"],),
            ).fetchone()
            linked["invoice"] = dict(inv) if inv else {"error": "linked invoice not found"}
        if ticket["lease_id"] is not None:
            lease = conn.execute("SELECT * FROM leases WHERE id = ?", (ticket["lease_id"],)).fetchone()
            linked["lease"] = dict(lease) if lease else {"error": "linked lease not found"}
        board = {
            "approval_requests": _rows(conn.execute(
                "SELECT id, request_type, ref_id, vendor_id, sku, size, qty, amount, status, "
                "requested_by, decided_by, payment_id FROM approval_requests WHERE ticket_id = ?",
                (ticket_id,),
            )),
            "drafts": _rows(conn.execute(
                "SELECT id, recipient, subject, drafted_by, status FROM drafts WHERE ticket_id = ?",
                (ticket_id,),
            )),
            "updates": _rows(conn.execute(
                "SELECT status, note, updated_by, created_at FROM ticket_updates "
                "WHERE ticket_id = ? ORDER BY id",
                (ticket_id,),
            )),
        }
    return {"shop_today": today.isoformat(), "ticket": ticket, "linked": linked, "board": board}


@mcp.tool
def check_stock(sku: str, size: str, qty_needed: int = 1) -> dict:
    """Check how many units of one SKU in one size are on the shelf, and the shortfall
    for a requested quantity.

    Reads the inventory table. Use it on order tickets to see whether the shop can fill
    the request now or must restock (for example ticket 103: 20 hoodies CC-HOOD-NAVY in
    size M; ticket 101: 1 tee CC-TEE-WHITE in size S). Also lists stock in the SKU's
    other sizes so the team can offer an alternative.

    Args:
        sku: Product SKU exactly as stored, e.g. "CC-HOOD-NAVY".
        size: Size code as stored: "S", "M", "L", "XL", or "OS" for one-size items.
        qty_needed: Units the customer wants (default 1).
    """
    if qty_needed < 1:
        return {"error": "qty_needed must be at least 1."}
    sku, size = sku.strip().upper(), size.strip().upper()
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT sku, name, size, qty, location FROM inventory WHERE sku = ? ORDER BY size",
            (sku,),
        ).fetchall()
    if not rows:
        return {"error": f"SKU {sku!r} is not in the inventory table."}
    match = next((r for r in rows if r["size"] == size), None)
    if match is None:
        return {
            "error": f"SKU {sku} has no size {size!r} in inventory.",
            "sizes_stocked": [r["size"] for r in rows],
        }
    on_hand = match["qty"]
    return {
        "sku": sku,
        "name": match["name"],
        "size": size,
        "location": match["location"],
        "qty_on_hand": on_hand,
        "qty_needed": qty_needed,
        "can_fill_now": on_hand >= qty_needed,
        "shortfall": max(0, qty_needed - on_hand),
        "other_sizes_on_hand": {r["size"]: r["qty"] for r in rows if r["size"] != size},
    }


@mcp.tool
def list_vendors() -> dict:
    """List every vendor with its specialty, lead time, open unpaid invoices and whether it
    will ship today, so the team can pick who restocks an item.

    Reads the vendors, invoices and desk tables. The inventory table has no vendor column:
    match a product to a vendor by the vendor's specialty (e.g. apparel such as tees and
    hoodies -> an apparel vendor) and say which specialty you matched on.
    """
    with closing(_connect()) as conn:
        today = _shop_today(conn)
        vendors = conn.execute("SELECT id, name, specialty, lead_days FROM vendors ORDER BY id").fetchall()
        out = []
        for v in vendors:
            invoices = _open_invoices(conn, v["id"])
            will_ship = not invoices
            out.append({
                "vendor_id": v["id"],
                "name": v["name"],
                "specialty": v["specialty"],
                "lead_days": v["lead_days"],
                "open_invoice_ids": [i["id"] for i in invoices],
                "open_balance": round(sum(i["amount"] for i in invoices), 2),
                "will_ship": will_ship,
                "eta_if_ordered_today": (today + timedelta(days=v["lead_days"])).isoformat() if will_ship else None,
            })
    return {"shop_today": today.isoformat(), "vendors": out}


@mcp.tool
def check_vendor_invoices(vendor_id: int) -> dict:
    """Check whether a vendor will ship: list the vendor's open (unpaid) invoices, how
    overdue each is versus the shop's today (desk.date_today), and the restock ETA.

    Shop rule: a vendor will NOT ship new product while it has any open unpaid invoice.
    Reads the vendors, invoices and desk tables. Use it before any restock, for example
    ticket 101, whose invoice 501 belongs to vendor 1 (Bulldog Print Co).

    Args:
        vendor_id: The vendor's id from the vendors table (invoices.vendor_id).
    """
    with closing(_connect()) as conn:
        vendor = conn.execute(
            "SELECT id, name, specialty, lead_days FROM vendors WHERE id = ?", (vendor_id,)
        ).fetchone()
        if vendor is None:
            return {"error": f"No vendor with id {vendor_id} in the vendors table."}
        today = _shop_today(conn)
        invoices = _open_invoices(conn, vendor_id)

    open_invoices = []
    for inv in invoices:
        days_past_due = (today - date.fromisoformat(inv["due_date"])).days
        open_invoices.append({
            "invoice_id": inv["id"],
            "amount": inv["amount"],
            "due_date": inv["due_date"],
            "status": inv["status"],
            "description": inv["description"],
            "is_overdue": days_past_due > 0,
            "days_overdue": max(0, days_past_due),
        })
    will_ship = not open_invoices
    return {
        "shop_today": today.isoformat(),
        "vendor_id": vendor["id"],
        "vendor_name": vendor["name"],
        "specialty": vendor["specialty"],
        "lead_days": vendor["lead_days"],
        "open_invoices": open_invoices,
        "open_balance": round(sum(i["amount"] for i in open_invoices), 2),
        "will_ship": will_ship,
        "blocked_reason": None if will_ship else (
            f"{vendor['name']} has {len(open_invoices)} open unpaid invoice(s); "
            "they will not ship until paid."
        ),
        # ETA if an order were placed today. When blocked, the clock starts only after payment.
        "eta_if_ordered_today": (today + timedelta(days=vendor["lead_days"])).isoformat()
        if will_ship else None,
    }


@mcp.tool
def get_lease_rent_status(lease_id: int) -> dict:
    """Get a lease's rent amount, next due date, and whether rent is overdue or how many
    days are left, measured against the shop's today (desk.date_today).

    Owner policy: rent may never be more than 30 days past due, so the result also gives
    policy_latest_pay_date (next_due + 30 days).

    Reads the leases and desk tables. Use it on rent tickets, for example ticket 102
    (Elm City Properties, lease 1), to confirm the amount and deadline from the lease
    itself rather than from the landlord's email.

    Args:
        lease_id: The lease's id from the leases table (tickets.lease_id).
    """
    with closing(_connect()) as conn:
        lease = conn.execute(
            "SELECT id, space_name, landlord, monthly_rent, next_due, notes "
            "FROM leases WHERE id = ?",
            (lease_id,),
        ).fetchone()
        if lease is None:
            return {"error": f"No lease with id {lease_id} in the leases table."}
        today = _shop_today(conn)

    next_due = date.fromisoformat(lease["next_due"])
    days_until_due = (next_due - today).days
    hard_deadline = next_due + timedelta(days=RENT_MAX_DAYS_PAST_DUE)
    return {
        "shop_today": today.isoformat(),
        "lease_id": lease["id"],
        "space_name": lease["space_name"],
        "landlord": lease["landlord"],
        "monthly_rent": lease["monthly_rent"],
        "next_due": lease["next_due"],
        "days_until_due": days_until_due,
        "is_overdue": days_until_due < 0,
        "notes": lease["notes"],
        # Owner policy: rent may never be more than 30 days past due.
        "policy_latest_pay_date": hard_deadline.isoformat(),
        "days_until_policy_latest_pay_date": (hard_deadline - today).days,
        "policy_breached": (today - next_due).days > RENT_MAX_DAYS_PAST_DUE,
    }


@mcp.tool
def get_cash_position(account: str = "checking") -> dict:
    """Get the cash balance, the total already waiting in pending approval requests, and
    what would be left if every pending request were approved.

    Reads cash_accounts, approval_requests and payments. Money only goes out in this shop
    (no revenue is modeled), so this balance is all the team can ever spend. Owner policy
    keeps a $100 minimum reserve: spendable_after_pending is what is truly left to commit.

    Args:
        account: Cash account name from cash_accounts (default "checking").
    """
    with closing(_connect()) as conn:
        acct = conn.execute(
            "SELECT name, balance, date FROM cash_accounts WHERE name = ?", (account,)
        ).fetchone()
        if acct is None:
            names = [r["name"] for r in conn.execute("SELECT name FROM cash_accounts")]
            return {"error": f"No cash account {account!r}.", "accounts": names}
        pending = _rows(conn.execute(
            "SELECT id, ticket_id, request_type, ref_id, amount, requested_by FROM approval_requests "
            "WHERE status = 'pending' AND account = ? ORDER BY id",
            (account,),
        ))
        paid = _rows(conn.execute(
            "SELECT id, kind, ref_id, amount, paid_at, approved_by FROM payments WHERE account = ? ORDER BY id",
            (account,),
        ))
        today = _shop_today(conn)
    pending_total = round(sum(p["amount"] for p in pending), 2)
    return {
        "shop_today": today.isoformat(),
        "account": acct["name"],
        "balance": acct["balance"],
        "balance_as_of": acct["date"],
        "pending_requests": pending,
        "pending_total": pending_total,
        "balance_after_all_pending": round(acct["balance"] - pending_total, 2),
        "min_cash_reserve": MIN_CASH_RESERVE,
        "spendable_after_pending": round(acct["balance"] - pending_total - MIN_CASH_RESERVE, 2),
        "payments_made": paid,
    }


@mcp.tool
def check_price_margin(sku: str, discount_pct: float = 0.0, qty: int = 1) -> dict:
    """Work out the unit price, unit margin and order totals for a SKU at a given discount
    off list price.

    Reads the pricing table (unit_cost, list_price). Use it on discount / price-override
    tickets (e.g. ticket 103: Yale AI Club wants 20 CC-HOOD-NAVY at a bulk discount) to
    compare options before the Boss decides. Owner policy: never more than 20% off list and
    never below a 50% margin; both must hold. The result says whether the option is within
    policy and the largest discount the policy allows for this SKU.

    Args:
        sku: Product SKU exactly as stored, e.g. "CC-HOOD-NAVY".
        discount_pct: Percent off list price, from 0 up to (not including) 100. 15 = 15% off.
        qty: Units in the order (default 1).
    """
    if not 0 <= discount_pct < 100:
        return {"error": "discount_pct must be at least 0 and below 100."}
    if qty < 1:
        return {"error": "qty must be at least 1."}
    sku = sku.strip().upper()
    with closing(_connect()) as conn:
        p = conn.execute("SELECT sku, unit_cost, list_price FROM pricing WHERE sku = ?", (sku,)).fetchone()
    if p is None:
        return {"error": f"SKU {sku!r} is not in the pricing table."}
    unit_price = round(p["list_price"] * (1 - discount_pct / 100), 2)
    unit_margin = round(unit_price - p["unit_cost"], 2)
    margin_pct = round(100 * unit_margin / unit_price, 1) if unit_price else None
    # Largest discount that keeps the margin >= MIN_MARGIN_PCT: price >= cost / (1 - m).
    floor_price = p["unit_cost"] / (1 - MIN_MARGIN_PCT / 100)
    margin_cap = max(0.0, 100 * (1 - floor_price / p["list_price"]))
    max_allowed = round(min(MAX_DISCOUNT_PCT, margin_cap), 1)
    problems = []
    if discount_pct > MAX_DISCOUNT_PCT:
        problems.append(f"more than {MAX_DISCOUNT_PCT:g}% off list")
    if margin_pct is None or margin_pct < MIN_MARGIN_PCT:
        problems.append(f"margin below {MIN_MARGIN_PCT:g}%")
    return {
        "sku": sku,
        "unit_cost": p["unit_cost"],
        "list_price": p["list_price"],
        "discount_pct": discount_pct,
        "unit_price": unit_price,
        "unit_margin": unit_margin,
        "margin_pct": margin_pct,
        "list_margin_pct": round(100 * (p["list_price"] - p["unit_cost"]) / p["list_price"], 1),
        "qty": qty,
        "order_revenue": round(unit_price * qty, 2),
        "order_cost": round(p["unit_cost"] * qty, 2),
        "order_gross_profit": round(unit_margin * qty, 2),
        "sells_below_cost": unit_margin < 0,
        "within_policy": not problems,
        "policy_problems": problems,
        "policy_max_discount_pct": max_allowed,
        "policy_price_at_max_discount": round(p["list_price"] * (1 - max_allowed / 100), 2),
    }


@mcp.tool
def quote_restock(vendor_id: int, sku: str, qty: int) -> dict:
    """Estimate what restocking qty units of a SKU from one vendor would cost and when it
    would arrive, and whether that vendor is blocked right now.

    Reads pricing (unit_cost is used as the vendor's unit price), vendors, invoices and
    desk. Read-only: it does not order anything. To actually order, Accounting files a
    purchase-order request for human approval.

    Args:
        vendor_id: The vendor's id from the vendors table.
        sku: Product SKU exactly as stored.
        qty: Units to restock (at least 1).
    """
    if qty < 1:
        return {"error": "qty must be at least 1."}
    sku = sku.strip().upper()
    with closing(_connect()) as conn:
        vendor = conn.execute("SELECT id, name, specialty, lead_days FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
        if vendor is None:
            return {"error": f"No vendor with id {vendor_id} in the vendors table."}
        p = conn.execute("SELECT unit_cost FROM pricing WHERE sku = ?", (sku,)).fetchone()
        if p is None:
            return {"error": f"SKU {sku!r} is not in the pricing table."}
        today = _shop_today(conn)
        blocking = _open_invoices(conn, vendor_id)
    will_ship = not blocking
    return {
        "shop_today": today.isoformat(),
        "vendor_id": vendor["id"],
        "vendor_name": vendor["name"],
        "specialty": vendor["specialty"],
        "sku": sku,
        "qty": qty,
        "unit_cost": p["unit_cost"],
        "estimated_cost": round(p["unit_cost"] * qty, 2),
        "lead_days": vendor["lead_days"],
        "will_ship": will_ship,
        "blocked_by_invoice_ids": [i["id"] for i in blocking],
        "eta_if_ordered_today": (today + timedelta(days=vendor["lead_days"])).isoformat() if will_ship else None,
        "eta_note": None if will_ship else (
            f"Blocked until invoice(s) {[i['id'] for i in blocking]} are paid; ETA = payment date + "
            f"{vendor['lead_days']} days."
        ),
    }


@mcp.tool
def list_board(ticket_id: int | None = None) -> dict:
    """List what is on the board: approval requests (payments and purchase orders waiting
    for a human), message drafts, and ticket status updates. Optionally for one ticket.

    Reads approval_requests, drafts and ticket_updates. Check it before filing anything so
    the team never files the same request or draft twice.

    Args:
        ticket_id: Only items for this ticket (omit for the whole board).
    """
    where, args = ("WHERE ticket_id = ?", (ticket_id,)) if ticket_id is not None else ("", ())
    with closing(_connect()) as conn:
        return {
            "approval_requests": _rows(conn.execute(f"SELECT * FROM approval_requests {where} ORDER BY id", args)),
            "drafts": _rows(conn.execute(f"SELECT * FROM drafts {where} ORDER BY id", args)),
            "ticket_updates": _rows(conn.execute(f"SELECT * FROM ticket_updates {where} ORDER BY id", args)),
        }


# ================================================================ WRITE TOOLS (agents)

@mcp.tool
def request_payment(
    ticket_id: int,
    payment_type: Literal["invoice", "rent"],
    ref_id: int,
    reason: str,
    requested_by: str,
    account: str = "checking",
) -> dict:
    """File a payment request for HUMAN approval. This does NOT pay anything.

    payment_type "invoice": ref_id is an invoices.id; the amount is that invoice's amount.
    payment_type "rent":    ref_id is a leases.id;  the amount is that lease's monthly_rent.
    The amount always comes from the database, never from the caller.

    Writes one row to approval_requests (status "pending"). Reads invoices / leases,
    cash_accounts and approval_requests. Refuses a duplicate of a pending request, an
    invoice that is not open, and any request that would commit cash below the owner's
    $100 minimum reserve (counting every pending request), so no balance can go negative.

    Args:
        ticket_id: The ticket this payment resolves, e.g. 101.
        payment_type: "invoice" or "rent".
        ref_id: Invoice id or lease id, matching payment_type.
        reason: One or two sentences a human approver can act on (what, why, why now).
        requested_by: The agent filing it (the backend fills this in).
        account: Cash account to pay from (default "checking").
    """
    reason = reason.strip()
    if not reason:
        return {"error": "reason is required so the human approver knows why."}
    with closing(_connect(readonly=False)) as conn:
        if not _ticket_exists(conn, ticket_id):
            return {"error": f"No ticket with id {ticket_id}."}
        acct = conn.execute("SELECT balance FROM cash_accounts WHERE name = ?", (account,)).fetchone()
        if acct is None:
            return {"error": f"No cash account {account!r}."}
        vendor_id = None
        if payment_type == "invoice":
            inv = conn.execute("SELECT id, vendor_id, amount, status FROM invoices WHERE id = ?", (ref_id,)).fetchone()
            if inv is None:
                return {"error": f"No invoice with id {ref_id}."}
            if inv["status"] != "open":
                return {"error": f"Invoice {ref_id} is {inv['status']!r}, not open; nothing to pay."}
            amount, vendor_id = inv["amount"], inv["vendor_id"]
        else:
            lease = conn.execute("SELECT id, monthly_rent FROM leases WHERE id = ?", (ref_id,)).fetchone()
            if lease is None:
                return {"error": f"No lease with id {ref_id}."}
            amount = lease["monthly_rent"]

        dup = conn.execute(
            "SELECT id FROM approval_requests WHERE status = 'pending' AND request_type = ? AND ref_id = ?",
            (payment_type, ref_id),
        ).fetchone()
        if dup:
            return {"error": f"A pending request for this {payment_type} already exists (request {dup['id']}).",
                    "existing_request_id": dup["id"]}

        pending = _pending_total(conn, account)
        if pending + amount > acct["balance"] - MIN_CASH_RESERVE:
            return {
                "error": f"Refused: this would commit cash below the ${MIN_CASH_RESERVE:,.0f} minimum reserve "
                         "on top of the requests already pending. Free cash first (e.g. withdraw a "
                         "lower-priority pending request) or defer this one.",
                "balance": acct["balance"], "pending_total": pending, "this_amount": amount,
                "min_cash_reserve": MIN_CASH_RESERVE,
                "short_by": round(pending + amount - (acct["balance"] - MIN_CASH_RESERVE), 2),
            }
        with conn:
            cur = conn.execute(
                "INSERT INTO approval_requests (ticket_id, request_type, ref_id, vendor_id, amount, account, "
                "reason, requested_by, requested_at, status) VALUES (?,?,?,?,?,?,?,?,?, 'pending')",
                (ticket_id, payment_type, ref_id, vendor_id, amount, account, reason,
                 _clean_name(requested_by) or "unknown", _now()),
            )
        return {
            "request_id": cur.lastrowid,
            "status": "pending",
            "payment_type": payment_type,
            "ref_id": ref_id,
            "amount": amount,
            "account": account,
            "balance": acct["balance"],
            "pending_total_including_this": round(pending + amount, 2),
            "balance_after_all_pending": round(acct["balance"] - pending - amount, 2),
            "spendable_after_pending": round(acct["balance"] - pending - amount - MIN_CASH_RESERVE, 2),
            "note": "Waiting for a human to approve on the dashboard. No money has moved.",
        }


@mcp.tool
def request_purchase_order(
    ticket_id: int,
    vendor_id: int,
    sku: str,
    size: str,
    qty: int,
    reason: str,
    requested_by: str,
    account: str = "checking",
) -> dict:
    """File a restock purchase order for HUMAN approval. This does NOT order or pay.

    The cost is qty x pricing.unit_cost (from the database). A purchase order is paid when a
    human approves it, so it is counted against cash like a payment. You may file it while
    the vendor still has an open invoice, but approval will be refused until that invoice is
    paid (a vendor will not ship while it has an open unpaid invoice).

    Writes one row to approval_requests (request_type "purchase_order", status "pending").
    Reads vendors, inventory, pricing, invoices, cash_accounts and approval_requests.
    Refuses duplicates and any request that would commit cash below the $100 reserve.

    Args:
        ticket_id: The ticket this restock serves.
        vendor_id: Vendor to order from (pick by specialty; see list_vendors).
        sku: Product SKU exactly as stored.
        size: Size code as stored ("S", "M", "L", "XL", "OS").
        qty: Units to order (at least 1).
        reason: One or two sentences for the human approver.
        requested_by: The agent filing it (the backend fills this in).
        account: Cash account to pay from (default "checking").
    """
    reason = reason.strip()
    if qty < 1:
        return {"error": "qty must be at least 1."}
    if not reason:
        return {"error": "reason is required so the human approver knows why."}
    sku, size = sku.strip().upper(), size.strip().upper()
    with closing(_connect(readonly=False)) as conn:
        if not _ticket_exists(conn, ticket_id):
            return {"error": f"No ticket with id {ticket_id}."}
        vendor = conn.execute("SELECT id, name, lead_days FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
        if vendor is None:
            return {"error": f"No vendor with id {vendor_id}."}
        if conn.execute("SELECT 1 FROM inventory WHERE sku = ? AND size = ?", (sku, size)).fetchone() is None:
            return {"error": f"{sku} size {size} is not in the inventory table."}
        p = conn.execute("SELECT unit_cost FROM pricing WHERE sku = ?", (sku,)).fetchone()
        if p is None:
            return {"error": f"SKU {sku!r} is not in the pricing table."}
        acct = conn.execute("SELECT balance FROM cash_accounts WHERE name = ?", (account,)).fetchone()
        if acct is None:
            return {"error": f"No cash account {account!r}."}
        dup = conn.execute(
            "SELECT id FROM approval_requests WHERE status = 'pending' AND request_type = 'purchase_order' "
            "AND vendor_id = ? AND sku = ? AND size = ?",
            (vendor_id, sku, size),
        ).fetchone()
        if dup:
            return {"error": f"A pending purchase order for {sku} {size} from this vendor already exists "
                             f"(request {dup['id']}).", "existing_request_id": dup["id"]}
        amount = round(p["unit_cost"] * qty, 2)
        pending = _pending_total(conn, account)
        if pending + amount > acct["balance"] - MIN_CASH_RESERVE:
            return {
                "error": f"Refused: this would commit cash below the ${MIN_CASH_RESERVE:,.0f} minimum reserve "
                         "on top of the requests already pending. Free cash first (e.g. withdraw a "
                         "lower-priority pending request) or defer this one.",
                "balance": acct["balance"], "pending_total": pending, "this_amount": amount,
                "min_cash_reserve": MIN_CASH_RESERVE,
                "short_by": round(pending + amount - (acct["balance"] - MIN_CASH_RESERVE), 2),
            }
        blocking = [i["id"] for i in _open_invoices(conn, vendor_id)]
        with conn:
            cur = conn.execute(
                "INSERT INTO approval_requests (ticket_id, request_type, vendor_id, sku, size, qty, amount, "
                "account, reason, requested_by, requested_at, status) "
                "VALUES (?, 'purchase_order', ?,?,?,?,?,?,?,?,?, 'pending')",
                (ticket_id, vendor_id, sku, size, qty, amount, account, reason,
                 _clean_name(requested_by) or "unknown", _now()),
            )
        return {
            "request_id": cur.lastrowid,
            "status": "pending",
            "vendor": vendor["name"],
            "sku": sku, "size": size, "qty": qty,
            "amount": amount,
            "lead_days": vendor["lead_days"],
            "blocked_by_invoice_ids": blocking,
            "balance_after_all_pending": round(acct["balance"] - pending - amount, 2),
            "note": ("Waiting for human approval. " + (
                f"Approval will be refused until invoice(s) {blocking} are paid." if blocking else
                "If approved today, goods arrive in lead_days.")),
        }


@mcp.tool
def draft_message(
    ticket_id: int,
    recipient: str,
    recipient_type: Literal["customer", "vendor", "landlord"],
    subject: str,
    body: str,
    drafted_by: str,
) -> dict:
    """Save a message DRAFT on the board. Nothing is ever sent: a human reviews and sends.

    Writes one row to the drafts table (status "draft"). Use it for replies to customers,
    and for any note to a vendor or landlord. Never call real vendors or email customers.

    Args:
        ticket_id: The ticket the message is about.
        recipient: Who it is for, as named on the ticket (e.g. "Tauhid Zaman").
        recipient_type: "customer", "vendor" or "landlord".
        subject: Short subject line.
        body: The full message text.
        drafted_by: The agent drafting it (the backend fills this in).
    """
    if not subject.strip() or not body.strip():
        return {"error": "subject and body are required."}
    with closing(_connect(readonly=False)) as conn:
        if not _ticket_exists(conn, ticket_id):
            return {"error": f"No ticket with id {ticket_id}."}
        with conn:
            cur = conn.execute(
                "INSERT INTO drafts (ticket_id, recipient, recipient_type, subject, body, drafted_by, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (ticket_id, recipient.strip(), recipient_type, subject.strip(), body.strip(),
                 _clean_name(drafted_by) or "unknown", _now()),
            )
    return {"draft_id": cur.lastrowid, "status": "draft", "note": "Saved on the board. Not sent."}


@mcp.tool
def update_ticket(
    ticket_id: int,
    status: Literal["open", "in_progress", "waiting_on_approval", "blocked", "resolved"],
    note: str,
    updated_by: str,
) -> dict:
    """Set a ticket's status and add a note explaining the decision or what it is waiting on.

    Updates tickets.status and appends a row to ticket_updates (the original tickets.notes
    text is never overwritten). Use "waiting_on_approval" while a payment or purchase order
    is pending, "blocked" when the shop cannot act yet (e.g. vendor blocked, not enough cash),
    and "resolved" only when nothing more is needed from the team.

    Args:
        ticket_id: The ticket to update.
        status: open | in_progress | waiting_on_approval | blocked | resolved.
        note: The decision and the facts behind it, in one to four sentences.
        updated_by: The agent updating it (the backend fills this in).
    """
    if status not in TICKET_STATUSES:
        return {"error": f"status must be one of {TICKET_STATUSES}."}
    if not note.strip():
        return {"error": "note is required."}
    with closing(_connect(readonly=False)) as conn:
        if conn.execute("SELECT 1 FROM tickets WHERE id = ?", (ticket_id,)).fetchone() is None:
            return {"error": f"No ticket with id {ticket_id}."}
        with conn:
            conn.execute("UPDATE tickets SET status = ? WHERE id = ?", (status, ticket_id))
            conn.execute(
                "INSERT INTO ticket_updates (ticket_id, status, note, updated_by, created_at) VALUES (?,?,?,?,?)",
                (ticket_id, status, note.strip(), _clean_name(updated_by) or "unknown", _now()),
            )
    return {"ticket_id": ticket_id, "status": status, "note": note.strip()}


@mcp.tool
def withdraw_request(request_id: int, reason: str, withdrawn_by: str) -> dict:
    """Withdraw a PENDING payment or purchase-order request so its cash is free again,
    for example when the Boss re-orders priorities because cash is short.

    Updates approval_requests (status "withdrawn"). Moves no money. Requests that were
    already paid, rejected or withdrawn cannot be withdrawn.

    Args:
        request_id: approval_requests.id to withdraw.
        reason: Why, for the human approver (e.g. "deferred: the customer restock comes
            first; rent stays within its 30-day limit").
        withdrawn_by: The agent withdrawing it (the backend fills this in).
    """
    if not reason.strip():
        return {"error": "reason is required."}
    with closing(_connect(readonly=False)) as conn:
        req = conn.execute("SELECT id, status, amount FROM approval_requests WHERE id = ?", (request_id,)).fetchone()
        if req is None:
            return {"error": f"No approval request {request_id}."}
        if req["status"] != "pending":
            return {"error": f"Request {request_id} is {req['status']!r}; only pending requests can be withdrawn."}
        with conn:
            conn.execute(
                "UPDATE approval_requests SET status='withdrawn', decided_by=?, decided_at=?, decision_note=? "
                "WHERE id = ?",
                (_clean_name(withdrawn_by) or "unknown", _now(), reason.strip(), request_id),
            )
    return {"request_id": request_id, "status": "withdrawn", "amount_freed": req["amount"]}


# ================================================================ HUMAN-ONLY TOOL

@mcp.tool
def decide_approval(
    request_id: int,
    decision: Literal["approve", "reject"],
    approver: str,
    note: str = "",
) -> dict:
    """HUMAN ONLY: approve or reject a pending payment / purchase-order request.
    The agents are never given this tool; the dashboard calls it when a person clicks.

    On approve, in one transaction: refuses if the cash balance would go negative or below the
    owner's $100 minimum reserve; refuses a
    purchase order while its vendor has an open unpaid invoice; otherwise writes a payments
    row (paid_at = desk.date_today, approved_by = the human), lowers cash_accounts.balance,
    and updates the related record (invoice -> status "paid"; rent -> leases.next_due moves
    one month; purchase order -> expected_arrival = today + vendor lead_days).
    On reject, only the request is marked "rejected".

    Args:
        request_id: approval_requests.id to decide.
        decision: "approve" or "reject".
        approver: The person's name. Agent names are refused.
        note: Optional reason.
    """
    approver = _clean_name(approver)
    if not approver or approver.lower() in AGENT_NAMES:
        return {"error": "A named human approver is required; agents cannot approve."}
    with closing(_connect(readonly=False)) as conn:
        req = conn.execute("SELECT * FROM approval_requests WHERE id = ?", (request_id,)).fetchone()
        if req is None:
            return {"error": f"No approval request {request_id}."}
        if req["status"] != "pending":
            return {"error": f"Request {request_id} is already {req['status']!r}."}
        today = _shop_today(conn)

        if decision == "reject":
            with conn:
                conn.execute(
                    "UPDATE approval_requests SET status='rejected', decided_by=?, decided_at=?, decision_note=? "
                    "WHERE id = ?",
                    (approver, _now(), note.strip(), request_id),
                )
            return {"request_id": request_id, "status": "rejected", "decided_by": approver}

        acct = conn.execute("SELECT balance FROM cash_accounts WHERE name = ?", (req["account"],)).fetchone()
        if acct is None:
            return {"error": f"Cash account {req['account']!r} not found."}
        if req["amount"] > acct["balance"]:
            return {"error": "Refused: not enough cash. The balance cannot go negative.",
                    "balance": acct["balance"], "amount": req["amount"], "status": "pending"}
        if acct["balance"] - req["amount"] < MIN_CASH_RESERVE:
            return {"error": f"Refused: paying this would leave less than the ${MIN_CASH_RESERVE:,.0f} "
                             "minimum cash reserve.",
                    "balance": acct["balance"], "amount": req["amount"], "status": "pending"}

        expected_arrival = None
        if req["request_type"] == "invoice":
            inv = conn.execute("SELECT status FROM invoices WHERE id = ?", (req["ref_id"],)).fetchone()
            if inv is None or inv["status"] != "open":
                return {"error": f"Invoice {req['ref_id']} is no longer open.", "status": "pending"}
        elif req["request_type"] == "purchase_order":
            blocking = [i["id"] for i in _open_invoices(conn, req["vendor_id"])]
            if blocking:
                return {"error": f"Refused: vendor still has open unpaid invoice(s) {blocking}; "
                                 "they will not ship. Pay those first.", "status": "pending"}
            lead = conn.execute("SELECT lead_days FROM vendors WHERE id = ?", (req["vendor_id"],)).fetchone()
            expected_arrival = (today + timedelta(days=lead["lead_days"])).isoformat()

        payment_ref = req["id"] if req["request_type"] == "purchase_order" else req["ref_id"]
        new_balance = round(acct["balance"] - req["amount"], 2)
        updated: dict = {}
        with conn:  # one transaction: payment row + cash + related record + request
            cur = conn.execute(
                "INSERT INTO payments (kind, ref_id, amount, account, paid_at, approved_by) VALUES (?,?,?,?,?,?)",
                (req["request_type"], payment_ref, req["amount"], req["account"], today.isoformat(), approver),
            )
            conn.execute(
                "UPDATE cash_accounts SET balance = ?, date = ? WHERE name = ?",
                (new_balance, today.isoformat(), req["account"]),
            )
            if req["request_type"] == "invoice":
                conn.execute("UPDATE invoices SET status = 'paid' WHERE id = ?", (req["ref_id"],))
                updated = {"invoice_id": req["ref_id"], "invoice_status": "paid"}
            elif req["request_type"] == "rent":
                lease = conn.execute("SELECT next_due FROM leases WHERE id = ?", (req["ref_id"],)).fetchone()
                next_due = _add_month(date.fromisoformat(lease["next_due"])).isoformat()
                conn.execute("UPDATE leases SET next_due = ? WHERE id = ?", (next_due, req["ref_id"]))
                updated = {"lease_id": req["ref_id"], "paid_for_due_date": lease["next_due"], "new_next_due": next_due}
            else:
                updated = {"expected_arrival": expected_arrival}
            conn.execute(
                "UPDATE approval_requests SET status='paid', decided_by=?, decided_at=?, decision_note=?, "
                "payment_id=?, expected_arrival=? WHERE id = ?",
                (approver, _now(), note.strip(), cur.lastrowid, expected_arrival, request_id),
            )
    return {
        "request_id": request_id,
        "status": "paid",
        "payment_id": cur.lastrowid,
        "amount": req["amount"],
        "approved_by": approver,
        "paid_at": today.isoformat(),
        "new_balance": new_balance,
        "updated": updated,
    }


# ---------------------------------------------------------------- entry point

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Campus Customs MCP server")
    parser.add_argument("--http", action="store_true", help="serve over HTTP instead of stdio")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    if args.http:
        mcp.run(transport="http", host="127.0.0.1", port=args.port)
    else:
        mcp.run()
