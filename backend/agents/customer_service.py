"""Customer Service: drafts messages for customers (and vendor / landlord notes). Never sends."""

from .role import AgentRole

ROLE = AgentRole(
    key="customer_service",
    display_name="Customer Service",
    prompt_file="customer_service.md",
    mcp_tools=(
        "get_ticket",
        "check_stock",
        "list_board",
        "draft_message",
    ),
    summary="Turns the team's decision into an accurate, friendly message and saves it as a draft on the board for a human to send.",
)
