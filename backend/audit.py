"""Append-only audit trail: output/audit_trail.json.

The file is one JSON list. Every agent loop step is appended the moment it happens,
so a crash mid-run still leaves everything up to that point. Nothing is ever removed:
each append reads the list, adds the new entry, and atomically replaces the file.
If the file is ever unreadable it is set aside (never deleted) and a new list starts.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any

from config import AUDIT_PATH, AUDIT_PREVIEW_CHARS
from models import AuditEvent

_lock = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def preview(value: Any, limit: int = AUDIT_PREVIEW_CHARS) -> Any:
    """Keep audit entries readable: long tool results are cut to `limit` characters."""
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, default=str)
        return value if len(text) <= limit else text[: limit - 1] + "…"
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def append(event: str, **fields: Any) -> dict[str, Any]:
    """Validate one event and append it to the audit file. Returns the stored entry."""
    entry = AuditEvent(time=now_iso(), event=event, **fields).model_dump(exclude_none=True)
    with _lock:
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        rows: list[Any] = []
        if AUDIT_PATH.exists() and AUDIT_PATH.stat().st_size > 0:
            try:
                loaded = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
                rows = loaded if isinstance(loaded, list) else [loaded]
            except json.JSONDecodeError:
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                AUDIT_PATH.replace(AUDIT_PATH.with_name(f"audit_trail.unreadable-{stamp}.json"))
        rows.append(entry)
        tmp = AUDIT_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(rows, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        tmp.replace(AUDIT_PATH)
    return entry
