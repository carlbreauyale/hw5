"""Accounting: cash, invoices and margins; files payments and purchase orders for human approval."""

from .role import AgentRole

ROLE = AgentRole(
    key="accounting",
    display_name="Accounting",
    prompt_file="accounting.md",
    mcp_tools=(
        "get_ticket",
        "get_cash_position",
        "check_vendor_invoices",
        "get_lease_rent_status",
        "check_price_margin",
        "quote_restock",
        "list_board",
        "request_payment",
        "request_purchase_order",
        "withdraw_request",
    ),
    summary="Watches cash and invoices, checks margins, and files payment / purchase-order requests for human approval (never pays).",
)
