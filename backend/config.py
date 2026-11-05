"""Shared configuration for the Campus Customs agent team: model, paths and limits.

Every agent uses the same model (gpt-6-luna) through Portkey with the OpenAI SDK.
PORTKEY_API_KEY is read from a .env file in HW5/ or the course folder above it.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from dotenv import load_dotenv  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings  # noqa: E402
from pydantic_ai.providers.openai import OpenAIProvider  # noqa: E402
from pydantic_ai.usage import UsageLimits  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent                      # HW5/
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(PROJECT_DIR.parent / ".env")              # course root .env (holds PORTKEY_API_KEY)

# ---------------------------------------------------------------- model
MODEL_NAME = "gpt-6-luna"                             # the only model used by every agent
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1").rstrip("/")
API_TIMEOUT_S = 120
API_MAX_RETRIES = 2

# ---------------------------------------------------------------- paths
PROMPTS_DIR = BACKEND_DIR / "prompts"
MCP_SERVER_DIR = PROJECT_DIR / "mcp_server"
ORIGINAL_DB = PROJECT_DIR / "data" / "campus_customs.db"
WORKING_DB = Path(os.getenv("CAMPUS_CUSTOMS_DB", PROJECT_DIR / "data" / "campus_customs_new.db"))
AUDIT_PATH = Path(os.getenv("CAMPUS_AUDIT_PATH", PROJECT_DIR / "output" / "audit_trail.json"))

# ---------------------------------------------------------------- limits (token / loop control)
# One ticket run = the Boss plus every agent it (transitively) delegates to. All of them share
# one usage counter, so these caps apply to the whole ticket, not to each agent separately.
TICKET_REQUEST_LIMIT = 30          # model calls across all agents for one ticket
TICKET_TOOL_CALLS_LIMIT = 60       # MCP + delegation tool calls for one ticket
TICKET_TOTAL_TOKENS_LIMIT = 250_000
RUN_REQUEST_LIMIT = 8              # model calls inside ONE specialist's loop (per delegation)
BOSS_RUN_REQUEST_LIMIT = 14        # the Boss coordinates several specialists, then records and reports
MAX_DELEGATION_DEPTH = 3           # Boss -> A -> B -> C, then no further hand-offs
MAX_DELEGATIONS_PER_TICKET = 8
MAX_DELEGATION_TASK_CHARS = 2_000  # a hand-off is a brief, not a transcript
MAX_OUTPUT_TOKENS = 4_000          # per model response
AUDIT_PREVIEW_CHARS = 1_500        # tool results are truncated in the audit file beyond this


# Enforced by PydanticAI on the shared usage counter (whole ticket). RUN_REQUEST_LIMIT (and
# BOSS_RUN_REQUEST_LIMIT for the Boss) is
# enforced by the team loop itself (agents/team.py), counting only that agent's own steps.
TICKET_LIMITS = UsageLimits(
    request_limit=TICKET_REQUEST_LIMIT,
    tool_calls_limit=TICKET_TOOL_CALLS_LIMIT,
    total_tokens_limit=TICKET_TOTAL_TOKENS_LIMIT,
)


MODEL_SETTINGS = OpenAIResponsesModelSettings(
    max_tokens=MAX_OUTPUT_TOKENS,
    openai_reasoning_summary="auto",   # short reasoning summaries go into the audit trail
)


def steps_for(agent: str) -> int:
    """Model-step cap for one agent loop."""
    return BOSS_RUN_REQUEST_LIMIT if agent == "boss" else RUN_REQUEST_LIMIT


def require_api_key() -> str:
    key = os.getenv("PORTKEY_API_KEY", "").strip()
    if not key:
        raise RuntimeError("PORTKEY_API_KEY is not set. Put it in the .env file in the course folder.")
    return key


@lru_cache(maxsize=1)
def build_model() -> OpenAIResponsesModel:
    """One shared model client (OpenAI SDK pointed at Portkey) for every agent."""
    key = require_api_key()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_BASE_URL,
        default_headers={"x-portkey-api-key": key},
        timeout=API_TIMEOUT_S,
        max_retries=API_MAX_RETRIES,
    )
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def load_prompt(file_name: str) -> str:
    return (PROMPTS_DIR / file_name).read_text(encoding="utf-8")
