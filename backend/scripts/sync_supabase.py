"""
Upload the local dataset to Supabase (optional).

The API does not need this. By default (DATA_BACKEND=local) it serves projects
from data/projects.json and keeps users in SQLite, with no network at all. This
script exists for teams that want the Supabase mirror the original code used:
it pushes data/projects.json and the seeded SQLite users into the tables
created by scripts/schema.sql, over Supabase's PostgREST endpoint.

Every write is an upsert keyed on the primary key, so running this twice
changes nothing the second time. That matters more than it sounds: on demo day
the safe move is always "just run it again".

Before running:
    1. Run scripts/schema.sql in the Supabase SQL editor.
    2. Run scripts/prepare_data.py  (creates data/projects.json)
    3. Run scripts/seed_users.py    (creates the SQLite accounts)
    4. Put SUPABASE_URL and SUPABASE_KEY in backend/.env

Run:  python scripts/sync_supabase.py --dry-run   # reports, sends nothing
      python scripts/sync_supabase.py             # actually uploads
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402

# PostgREST accepts large request bodies, but a smaller batch means a failure
# costs one visible chunk instead of the whole upload, and progress actually
# moves on screen.
BATCH_SIZE = 200

# How many characters of a Supabase error body to show. The full body can be a
# wall of JSON; the first line is nearly always the useful part.
ERROR_BODY_LIMIT = 400


class SyncError(Exception):
    """Anything the operator can fix. Reported as a message, never a traceback."""


# --------------------------------------------------------------------------
# row shaping
# --------------------------------------------------------------------------

def project_row(project: dict) -> dict[str, Any]:
    """
    Turn one projects.json record into a `projects` table row.

    projects.json is camelCase because the frontend consumes it directly;
    Postgres folds unquoted identifiers to lowercase, so the table is
    snake_case. This function is the single place those two spellings meet —
    if a column is renamed in schema.sql, it is renamed here and nowhere else.

    Only the columns the dashboards actually query are carried across. Fields
    like agencyShort or locationPrecision are display sugar the UI recomputes,
    so they are deliberately left behind rather than stored twice.
    """
    return {
        "id": project["id"],
        "anon_id": project.get("anonId"),
        "name": project.get("name"),
        "category": project.get("category"),
        "state": project.get("state"),
        "district": project.get("district"),
        "district_key": project.get("districtKey"),
        "constituency": project.get("constituency"),
        "agency": project.get("agency"),
        "mp": project.get("mp"),
        "status": project.get("status"),
        "sanctioned": project.get("sanctioned"),
        "budget": project.get("budget"),
        "sanction_amount": project.get("sanctionAmount"),
        "recommended_amount": project.get("recommendedAmount"),
        "total_paid": project.get("totalPaid"),
        "payment_count": project.get("paymentCount"),
        "payment_ratio": project.get("paymentRatio"),
        "recommended_date": project.get("recommendedDate"),
        "sanction_date": project.get("sanctionDate"),
        "completion_date": project.get("completionDate"),
        "lat": project.get("lat"),
        "lon": project.get("lon"),
        "risk_score": project.get("riskScore"),
        "risk_label": project.get("riskLabel"),
        "primary_reason": project.get("primaryReason"),
        "active_signals": project.get("activeSignals"),
        # Nested detail travels as jsonb. httpx serialises these dicts and
        # lists straight into the JSON body, so no manual json.dumps here.
        "scores": project.get("scores"),
        "signals": project.get("signals"),
        "peer": project.get("peer"),
        "duplicate_match": project.get("duplicateMatch"),
    }


def user_row(row: sqlite3.Row) -> dict[str, Any]:
    """
    Turn one SQLite users row into a `users` table row.

    The two schemas already use identical column names, so this is a straight
    copy. It stays a function anyway so the column list is written down once
    and a future SQLite-only column cannot silently break the upload.
    """
    return {
        "id": row["id"],
        "username": row["username"],
        # Already a salted hash from app/security.py. No plaintext password
        # exists anywhere in this path, including the shared demo one.
        "password_hash": row["password_hash"],
        "name": row["name"],
        "role": row["role"],
        "mp_name": row["mp_name"],
        "district_key": row["district_key"],
        "constituency": row["constituency"],
        "organisation": row["organisation"],
        "created_at": row["created_at"],
    }


# --------------------------------------------------------------------------
# loading local data
# --------------------------------------------------------------------------

def load_projects() -> list[dict[str, Any]]:
    if not config.PROJECTS_FILE.exists():
        raise SyncError(
            f"{config.PROJECTS_FILE} not found.\n"
            "  Build it first:  python scripts/prepare_data.py"
        )
    with config.PROJECTS_FILE.open(encoding="utf-8") as fh:
        payload = json.load(fh)
    projects = payload.get("projects") or []
    if not projects:
        raise SyncError(
            f"{config.PROJECTS_FILE} contains no projects.\n"
            "  Rebuild it:  python scripts/prepare_data.py"
        )
    return [project_row(p) for p in projects]


def load_users() -> list[dict[str, Any]]:
    if not config.SQLITE_FILE.exists():
        raise SyncError(
            f"{config.SQLITE_FILE} not found.\n"
            "  Create the accounts first:  python scripts/seed_users.py"
        )
    conn = sqlite3.connect(config.SQLITE_FILE)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
    except sqlite3.OperationalError as exc:
        # Almost always "no such table: users" — the database file exists but
        # was never seeded.
        raise SyncError(
            f"could not read users from {config.SQLITE_FILE}: {exc}\n"
            "  Try:  python scripts/seed_users.py"
        ) from exc
    finally:
        conn.close()

    if not rows:
        raise SyncError(
            "the users table is empty.\n"
            "  Create the accounts first:  python scripts/seed_users.py"
        )
    return [user_row(row) for row in rows]


def batched(rows: list[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


# --------------------------------------------------------------------------
# talking to Supabase
# --------------------------------------------------------------------------

def rest_headers() -> dict[str, str]:
    """
    PostgREST wants the key twice: once as `apikey` for the gateway and once as
    a bearer token for Postgres role resolution.

    `resolution=merge-duplicates` is what makes POST behave as an upsert, and
    `return=minimal` stops Supabase echoing every uploaded row back at us —
    on 4,807 projects that response would be larger than the request.
    """
    return {
        "apikey": config.SUPABASE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def describe_http_error(table: str, status: int, body: str) -> str:
    """Translate a PostgREST failure into something actionable."""
    body = " ".join(body.split())[:ERROR_BODY_LIMIT]

    if status in (401, 403):
        hint = (
            "the key was rejected, or row level security is blocking the write.\n"
            "  Check SUPABASE_KEY, and remember the anon key cannot write to a\n"
            "  table with RLS enabled and no matching policy."
        )
    elif status == 404:
        hint = (
            f"Supabase has no table called '{table}'.\n"
            "  Run scripts/schema.sql in the Supabase SQL editor first."
        )
    elif status == 409:
        hint = (
            "a constraint rejected the batch (usually a foreign key).\n"
            "  Upload projects before work logs."
        )
    elif status >= 500:
        hint = "Supabase returned a server error. Wait a moment and run it again."
    else:
        hint = "Supabase rejected the request."

    return f"upload to '{table}' failed with HTTP {status}: {hint}\n  response: {body}"


def upload(client, table: str, rows: list[dict[str, Any]], conflict_column: str) -> None:
    """Upsert every row of one table, printing a line per batch."""
    import httpx  # local import: see main() for why

    url = f"{config.SUPABASE_URL}/rest/v1/{table}"
    total = len(rows)
    done = 0

    for index, batch in enumerate(batched(rows, BATCH_SIZE), start=1):
        try:
            response = client.post(
                url,
                params={"on_conflict": conflict_column},
                headers=rest_headers(),
                json=batch,
            )
        except httpx.HTTPError as exc:
            # Network-level failure: no response to inspect, so report the
            # cause rather than a traceback.
            raise SyncError(
                f"could not reach Supabase while uploading '{table}': {exc}\n"
                "  Check SUPABASE_URL and your connection."
            ) from exc

        if response.status_code >= 400:
            raise SyncError(describe_http_error(table, response.status_code, response.text))

        done += len(batch)
        percent = done * 100 // total
        print(f"    batch {index:>3}  {done:>6} / {total:<6} rows  {percent:>3}%")


def count_rows(client, table: str) -> int | str:
    """
    Read back how many rows the table now holds, as a sanity check.

    PostgREST reports an exact count in the Content-Range header ("0-0/4807")
    when asked with Prefer: count=exact, so this costs one row of transfer
    rather than the whole table.
    """
    import httpx

    headers = {
        "apikey": config.SUPABASE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_KEY}",
        "Prefer": "count=exact",
        "Range": "0-0",
    }
    try:
        response = client.get(
            f"{config.SUPABASE_URL}/rest/v1/{table}",
            params={"select": "id"},
            headers=headers,
        )
    except httpx.HTTPError as exc:
        return f"unavailable ({exc})"

    if response.status_code >= 400:
        return f"unavailable (HTTP {response.status_code})"

    content_range = response.headers.get("content-range", "")
    _, _, total = content_range.partition("/")
    return int(total) if total.isdigit() else "unknown"


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload projects.json and the seeded users into Supabase."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would be uploaded and exit without contacting Supabase",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("=" * 62)
    print("Smart Nigrani System — syncing to Supabase" + ("  (dry run)" if args.dry_run else ""))
    print("=" * 62)

    projects = load_projects()
    users = load_users()

    print(f"  projects to upload       {len(projects):>7}")
    print(f"  users to upload          {len(users):>7}")
    print(f"  batch size               {BATCH_SIZE:>7}")
    print(f"  batches                  {_batch_count(projects) + _batch_count(users):>7}")
    print()

    if args.dry_run:
        # Deliberately stops before anything is imported or connected: a dry
        # run must be safe to type at a database you are not allowed to write.
        print("  dry run — nothing was sent")
        print("  would upsert into 'projects' on conflict (id)")
        print("  would upsert into 'users'    on conflict (id)")
        print()
        print("  sample project row")
        for key, value in list(projects[0].items())[:8]:
            print(f"    {key:<20} {_preview(value)}")
        print("=" * 62)
        return

    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise SyncError(
            "Supabase credentials are missing.\n"
            "  Set SUPABASE_URL and SUPABASE_KEY in backend/.env, then run again.\n"
            "  (The API itself does not need them — it runs on SQLite by default.)"
        )

    # httpx is imported here, not at the top, for the same reason the API
    # imports it lazily: it is an optional dependency, and --dry-run must work
    # on a machine where it was never installed.
    try:
        import httpx
    except ImportError as exc:
        raise SyncError(
            "httpx is not installed, and it is needed to talk to Supabase.\n"
            "  Install it:  pip install -r requirements.txt"
        ) from exc

    # The URL is safe to show and helps catch a typo'd project ref. The key is
    # never printed, in full or in part.
    print(f"  target                   {config.SUPABASE_URL}")
    print()

    with httpx.Client(timeout=60.0) as client:
        print("  uploading projects")
        upload(client, "projects", projects, "id")
        print()
        print("  uploading users")
        upload(client, "users", users, "id")
        print()

        # Read the counts back rather than trusting the upload's own tally —
        # this is the check that catches rows silently dropped by RLS.
        print("  verifying")
        project_count = count_rows(client, "projects")
        user_count = count_rows(client, "users")

    print(f"    projects in Supabase   {project_count:>7}")
    print(f"    users in Supabase      {user_count:>7}")

    if project_count != len(projects) or user_count != len(users):
        print()
        print("  NOTE counts differ from what was uploaded. That is expected if the")
        print("       tables already held other rows; otherwise check RLS policies.")

    print()
    print("  done — safe to run again at any time")
    print("=" * 62)


def _batch_count(rows: list[dict[str, Any]]) -> int:
    return (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE


def _preview(value: Any, limit: int = 40) -> str:
    """Short, single-line rendering of a cell value for the dry-run sample."""
    text = "NULL" if value is None else str(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


if __name__ == "__main__":
    try:
        main()
    except SyncError as error:
        # Everything the operator can act on lands here, as a message rather
        # than a stack trace.
        print()
        print(f"  ERROR {error}")
        print("=" * 62)
        sys.exit(1)
    except KeyboardInterrupt:
        print()
        print("  cancelled — already-uploaded batches are unaffected, just run it again")
        sys.exit(130)
