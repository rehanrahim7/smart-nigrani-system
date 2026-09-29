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

# ---------------------------------------------------------------------------
# Which websites are allowed to call this API
# ---------------------------------------------------------------------------
# A browser blocks a page on one address from reading a reply from another
# address unless the API says that address is allowed. That is why a frontend
# on Vercel gets nothing back from an API on Render until the API is told
# about it. Two ways to tell it:
#
#   CORS_ORIGINS       exact addresses, comma separated. "*" means anyone.
#   CORS_ORIGIN_REGEX  a pattern, for hosts that change address every deploy.
#
# The default pattern covers the free hosting people actually use for a
# hackathon, so a deploy works without editing anything. To lock it down,
# set CORS_ORIGIN_REGEX to an empty string and list exact addresses instead.
_DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173"
)

_origins_raw = os.getenv("CORS_ORIGINS", _DEFAULT_ORIGINS).strip()

CORS_ALLOW_ALL = _origins_raw == "*"

CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in _origins_raw.split(",")
    if origin.strip() and origin.strip() != "*"
]

CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https://[a-z0-9-]+\.(vercel\.app|netlify\.app|onrender\.com|github\.io)",
).strip()


def supabase_enabled() -> bool:
    return DATA_BACKEND == "supabase" and bool(SUPABASE_URL and SUPABASE_KEY)

# ---------------------------------------------------------------------------
# Gemini photo descriptions (optional)
# ---------------------------------------------------------------------------
# With no key the feature says it is unavailable; photographs are still saved
# for human review. The key is only ever read here, on the server.
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
GEMINI_DAILY_LIMIT = int(os.getenv("GEMINI_DAILY_LIMIT", 20))


def gemini_configured() -> bool:
    return bool(GEMINI_API_KEY)
