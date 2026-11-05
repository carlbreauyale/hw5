"""Boss: reads each ticket, decides who works on it, and makes the final call."""

from .role import AgentRole

ROLE = AgentRole(
    key="boss",
    display_name="Boss",
    prompt_file="boss.md",
    mcp_tools=(
        "list_open_tickets",
        "get_ticket",
        "list_board",
        "get_cash_position",
        "check_price_margin",
        "update_ticket",
    ),
    summary="Reads each ticket, routes work to the specialists, makes final calls (discounts, priorities), sets ticket status.",
)
