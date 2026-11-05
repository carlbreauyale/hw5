"""What defines one agent on the team: its key, prompt file and the MCP tools it may use."""

from __future__ import annotations

from dataclasses import dataclass

from models import AgentKey


@dataclass(frozen=True)
class AgentRole:
    key: AgentKey
    display_name: str
    prompt_file: str              # file in backend/prompts/
    mcp_tools: tuple[str, ...]    # least privilege: the only campus-customs MCP tools this agent sees
    summary: str                  # one line, for the harness and the dashboard
