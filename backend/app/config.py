"""Runtime configuration.

Everything has a working default, so `uvicorn app.main:app` runs with no .env
file at all. That matters on demo day: nothing should depend on a config file
somebody forgot to copy.
"""

from __future__ import annotations

import os
from pathlib import Path

# Load .env if python-dotenv is installed. It is optional on purpose — a
# missing .env must never stop the server from starting.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is a convenience, not a need
    pass

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

PROJECTS_FILE = DATA_DIR / "projects.json"
SQLITE_FILE = Path(os.getenv("SNS_DB", DATA_DIR / "sns.sqlite3"))

# Storage is ALWAYS local: SQLite for users and work logs, projects.json for
# project data. This flag does not switch the live read/write path — it only
# records whether a Supabase mirror has been configured, which the startup log
# reports and scripts/sync_supabase.py uses to push a copy upstream.
#
# Do not tell anyone the app "runs on Supabase". It runs locally and can
# publish to Supabase. That is a smaller claim and a true one.
DATA_BACKEND = os.getenv("DATA_BACKEND", "local").strip().lower()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_KEY = (os.getenv("SUPABASE_KEY") or "").strip()

# Signing key for session tokens. A random default would log everyone out on
# every restart, so it is fixed for development and MUST be overridden in a
# real deployment.
SECRET_KEY = os.getenv("SECRET_KEY", "sns-dev-key-change-in-production")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", 60 * 60 * 12))

# Shared password for every seeded demo account.
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "nigrani")

# The sign-in screen offers a few sample accounts so a visitor can look around
# without being handed credentials. Set DEMO_ACCOUNTS=off to remove that list
# and its one-click sign-in, which is what you would do before putting this
# anywhere real.
DEMO_ACCOUNTS = os.getenv("DEMO_ACCOUNTS", "on").strip().lower()


def demo_accounts_enabled() -> bool:
    return DEMO_ACCOUNTS not in {"off", "false", "0", "no"}

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]


def supabase_enabled() -> bool:
    return DATA_BACKEND == "supabase" and bool(SUPABASE_URL and SUPABASE_KEY)
