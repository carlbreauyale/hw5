"""Facilities: the shop space side (lease, rent, landlord)."""

from .role import AgentRole

ROLE = AgentRole(
    key="facilities",
    display_name="Facilities",
    prompt_file="facilities.md",
    mcp_tools=(
        "get_ticket",
        "get_lease_rent_status",
        "get_cash_position",
        "list_board",
    ),
    summary="Confirms lease terms, rent amount and due dates against the shop's today, and checks landlord claims against the lease.",
)
