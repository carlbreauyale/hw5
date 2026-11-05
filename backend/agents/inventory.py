"""Inventory: stock by SKU and size, shortfalls, and which vendor can restock (and when)."""

from .role import AgentRole

ROLE = AgentRole(
    key="inventory",
    display_name="Inventory",
    prompt_file="inventory.md",
    mcp_tools=(
        "get_ticket",
        "check_stock",
        "list_vendors",
        "check_vendor_invoices",
        "quote_restock",
        "list_board",
    ),
    summary="Checks stock by SKU and size, spots shortfalls, finds the restock vendor by specialty, and reports blockers and ETAs.",
)
