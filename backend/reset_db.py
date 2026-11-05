"""Reset the working database from the original (shop rule: do this before a full run).

    python reset_db.py

Copies data/campus_customs.db over data/campus_customs_new.db. The original is only read.
This also clears the board (approval requests, drafts, ticket updates), which lives in the
working copy. The audit trail is NOT cleared: it is append-only.
"""

from __future__ import annotations

import shutil

import audit
from config import ORIGINAL_DB, WORKING_DB


def reset() -> str:
    if ORIGINAL_DB.resolve() == WORKING_DB.resolve():
        raise RuntimeError("Refusing to reset: the working DB path points at the original.")
    shutil.copyfile(ORIGINAL_DB, WORKING_DB)
    audit.append("db_reset", data={"from": ORIGINAL_DB.name, "to": str(WORKING_DB)})
    return f"Reset {WORKING_DB} from {ORIGINAL_DB.name}."


if __name__ == "__main__":
    print(reset())
