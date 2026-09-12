"""Data access.

Two kinds of data live here:

* Projects — read-only, loaded once from data/projects.json into memory. 4,807
  records is small enough that in-memory filtering is faster than any database
  round trip, and it means the demo keeps working with no network at all.

* Users and work logs — written at runtime, stored in SQLite. SQLite is the
  only live write path; there is no runtime Supabase code here. Supabase is an
  EXPORT target, populated by scripts/sync_supabase.py, not a second backend
  the app reads from. Keeping it that way is deliberate: the demo then has no
  network dependency at all and cannot be broken by venue wifi.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import unicodedata
from datetime import datetime, timezone
from typing import Any, Iterable

from . import config
from .security import hash_password

_LOCK = threading.Lock()


# --------------------------------------------------------------------------
# projects (read-only, in memory)
# --------------------------------------------------------------------------

class ProjectIndex:
    def __init__(self, payload: dict) -> None:
        self.generated_at: str = payload.get("generatedAt", "")
        self.snapshot: str = payload.get("snapshot", "")
        self.meta: dict = payload.get("meta", {})
        self.projects: list[dict] = payload.get("projects", [])
        self.by_id: dict[str, dict] = {p["id"]: p for p in self.projects}

        # Pre-computed lowercase blob per project so search does not rebuild
        # strings on every keystroke.
        self._search_blob: dict[str, str] = {
            p["id"]: " ".join(
                filter(
                    None,
                    (
                        p.get("name"),
                        p.get("id"),
                        p.get("anonId"),
                        p.get("district"),
                        p.get("constituency"),
                        p.get("mp"),
                        p.get("category"),
                        p.get("sector"),
                        p.get("agency"),
                    ),
                )
            ).lower()
            for p in self.projects
        }

        self.districts = sorted({p["district"] for p in self.projects if p.get("district")})
        self.categories = sorted({p["category"] for p in self.projects if p.get("category")})
        self.sectors = sorted({p["sector"] for p in self.projects if p.get("sector")})
        self.statuses = sorted({p["status"] for p in self.projects if p.get("status")})
        self.members = sorted({p["mp"] for p in self.projects if p.get("mp")})
        self.constituencies = sorted(
            {p["constituency"] for p in self.projects if p.get("constituency")}
        )

    # -- scoping -----------------------------------------------------------

    def scoped(self, user: dict | None) -> list[dict]:
        """
        Restrict the visible project set to what this user is allowed to see.

        MP     -> works recommended by that member of parliament
        vendor -> works implemented in that vendor's district

        There are only these two roles. A signed-in account always has one of
        them, so an account that somehow reaches here without a usable scope
        gets NOTHING rather than everything — failing closed is the only safe
        default for a system about public money.

        The anonymous case (the public landing page) returns the full set, but
        the only routes that use it return aggregate counts, never per-project
        detail.
        """
        if not user:
            return self.projects
        role = user.get("role")
        if role == "mp" and user.get("mpName"):
            target = user["mpName"]
            return [p for p in self.projects if p.get("mp") == target]
        if role == "vendor" and user.get("districtKey"):
            target = user["districtKey"]
            return [p for p in self.projects if p.get("districtKey") == target]
        return []

    # -- querying ----------------------------------------------------------

    def filter(
        self,
        rows: Iterable[dict],
        *,
        search: str | None = None,
        district: str | None = None,
        category: str | None = None,
        sector: str | None = None,
        status: str | None = None,
        risk: str | None = None,
        constituency: str | None = None,
        member: str | None = None,
        min_score: float | None = None,
    ) -> list[dict]:
        out = list(rows)

        if search:
            needle = _normalise(search)
            if needle:
                out = [p for p in out if needle in self._search_blob.get(p["id"], "")]

        if district and district != "all":
            out = [p for p in out if p.get("district") == district]
        if constituency and constituency != "all":
            out = [p for p in out if p.get("constituency") == constituency]
        if member and member != "all":
            out = [p for p in out if p.get("mp") == member]
        if category and category != "all":
            out = [p for p in out if p.get("category") == category]
        if sector and sector != "all":
            out = [p for p in out if p.get("sector") == sector]
        if status and status != "all":
            out = [p for p in out if p.get("status") == status]
        if risk and risk != "all":
            if risk == "flagged":
                # Anything above Routine — the working review queue.
                out = [p for p in out if p.get("riskLabel") != "Routine"]
            else:
                out = [p for p in out if p.get("riskLabel") == risk]
        if min_score is not None:
            out = [p for p in out if (p.get("riskScore") or 0) >= min_score]

        return out

    @staticmethod
    def sort(rows: list[dict], key: str = "risk") -> list[dict]:
        if key == "amount":
            return sorted(rows, key=lambda p: p.get("budget") or 0, reverse=True)
        if key == "recent":
            return sorted(rows, key=lambda p: p.get("sanctionDate") or "", reverse=True)
        if key == "name":
            return sorted(rows, key=lambda p: (p.get("name") or "").lower())
        # Default: highest review priority first, then largest budget, then a
        # stable id tiebreak so pagination never repeats or drops a row.
        return sorted(
            rows,
            key=lambda p: (-(p.get("riskScore") or 0), -(p.get("budget") or 0), p["id"]),
        )


def _normalise(value: str) -> str:
    """Lowercase and strip accents so 'Nashik' matches 'nashik'."""
    folded = unicodedata.normalize("NFKD", value or "")
    return "".join(c for c in folded if not unicodedata.combining(c)).strip().lower()


_index: ProjectIndex | None = None


def projects() -> ProjectIndex:
    global _index
    if _index is None:
        if not config.PROJECTS_FILE.exists():
            raise RuntimeError(
                f"{config.PROJECTS_FILE} not found. Run: python scripts/prepare_data.py"
            )
        with config.PROJECTS_FILE.open(encoding="utf-8") as fh:
            _index = ProjectIndex(json.load(fh))
    return _index


# --------------------------------------------------------------------------
# sqlite (users and work logs)
# --------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    mp_name       TEXT,
    district_key  TEXT,
    constituency  TEXT,
    organisation  TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_logs (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    work            TEXT NOT NULL,
    cost            INTEGER NOT NULL,
    work_date       TEXT NOT NULL,
    note            TEXT,
    created_by      TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS work_logs_project ON work_logs (project_id, work_date);
"""


def connect() -> sqlite3.Connection:
    config.SQLITE_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.SQLITE_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL lets reads continue while a write is in flight — relevant because the
    # MP dashboard polls while a vendor is adding work.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _LOCK, connect() as conn:
        conn.executescript(SCHEMA)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# -- users -----------------------------------------------------------------

def get_user(username: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip().lower(),)
        ).fetchone()
    return dict(row) if row else None


def user_public(row: dict) -> dict:
    """The user shape the frontend receives. Never includes the password hash."""
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["name"],
        "role": row["role"],
        "mpName": row.get("mp_name"),
        "districtKey": row.get("district_key"),
        "constituency": row.get("constituency"),
        "organisation": row.get("organisation"),
    }


def create_user(
    *,
    user_id: str,
    username: str,
    password: str,
    name: str,
    role: str,
    mp_name: str | None = None,
    district_key: str | None = None,
    constituency: str | None = None,
    organisation: str | None = None,
) -> None:
    with _LOCK, connect() as conn:
        conn.execute(
            """
            INSERT INTO users
                (id, username, password_hash, name, role, mp_name, district_key,
                 constituency, organisation, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(username) DO UPDATE SET
                password_hash = excluded.password_hash,
                name          = excluded.name,
                role          = excluded.role,
                mp_name       = excluded.mp_name,
                district_key  = excluded.district_key,
                constituency  = excluded.constituency,
                organisation  = excluded.organisation
            """,
            (
                user_id,
                username.strip().lower(),
                hash_password(password),
                name,
                role,
                mp_name,
                district_key,
                constituency,
                organisation,
                now_iso(),
            ),
        )


def remove_unsupported_roles(allowed: set[str]) -> int:
    """Delete accounts whose role is not in `allowed`. Returns how many went."""
    placeholders = ",".join("?" * len(allowed))
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            f"DELETE FROM users WHERE role NOT IN ({placeholders})", tuple(sorted(allowed))
        )
        return cursor.rowcount


def count_users() -> int:
    with connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


def sample_logins(per_role: int = 6) -> list[dict]:
    """
    Accounts to offer on the sign-in screen, so nobody has to be told a
    username to look around.

    Ranked by how much there is to see, not alphabetically: both lists are
    ordered by how many flagged works the account can reach. Sorting by name
    put 47 members ahead of the first contractor and landed on accounts whose
    dashboards are nearly empty, which is a poor first impression of a system
    about finding problems. Ranking both sides the same way also means the
    members and the contractors on offer cover the same districts, so the
    "contractor records work, member sees it" walkthrough works with two
    accounts taken straight off this list.
    """
    index = projects()

    flagged_by_mp: dict[str, int] = {}
    flagged_by_district: dict[str, int] = {}
    for project in index.projects:
        if project.get("riskLabel") == "Routine":
            continue
        if project.get("mp"):
            flagged_by_mp[project["mp"]] = flagged_by_mp.get(project["mp"], 0) + 1
        key = project.get("districtKey")
        if key:
            flagged_by_district[key] = flagged_by_district.get(key, 0) + 1

    with connect() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT username, name, role, constituency, district_key, mp_name FROM users"
        ).fetchall()]

    def interest(row: dict) -> int:
        if row["role"] == "mp":
            return flagged_by_mp.get(row["mp_name"] or "", 0)
        return flagged_by_district.get(row["district_key"] or "", 0)

    out: list[dict] = []
    for role in ("mp", "vendor"):
        ranked = sorted(
            (r for r in rows if r["role"] == role),
            key=lambda r: (-interest(r), r["username"]),
        )
        out.extend(ranked[:per_role])

    return [
        {
            "username": r["username"],
            "name": r["name"],
            "role": r["role"],
            "scope": r["constituency"] or r["district_key"] or "",
        }
        for r in out
    ]


# -- work logs -------------------------------------------------------------

def list_works(project_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM work_logs WHERE project_id = ?
            ORDER BY work_date ASC, created_at ASC
            """,
            (project_id,),
        ).fetchall()
    return [_work_public(dict(r), index + 1) for index, r in enumerate(rows)]


def works_summary(project_ids: list[str]) -> dict[str, dict]:
    """Counts and totals for many projects at once, for list views."""
    if not project_ids:
        return {}
    out: dict[str, dict] = {}
    with connect() as conn:
        # SQLite caps variables per statement; chunk to stay well under it.
        for start in range(0, len(project_ids), 400):
            chunk = project_ids[start : start + 400]
            placeholders = ",".join("?" * len(chunk))
            rows = conn.execute(
                f"""
                SELECT project_id, COUNT(*) AS entries, COALESCE(SUM(cost),0) AS total
                FROM work_logs WHERE project_id IN ({placeholders})
                GROUP BY project_id
                """,
                chunk,
            ).fetchall()
            for row in rows:
                out[row["project_id"]] = {
                    "entries": row["entries"],
                    "total": row["total"],
                }
    return out


def add_work(
    *,
    work_id: str,
    project_id: str,
    work: str,
    cost: int,
    work_date: str,
    note: str | None,
    created_by: str,
    created_by_name: str,
) -> dict:
    record = {
        "id": work_id,
        "project_id": project_id,
        "work": work,
        "cost": cost,
        "work_date": work_date,
        "note": note,
        "created_by": created_by,
        "created_by_name": created_by_name,
        "created_at": now_iso(),
    }
    with _LOCK, connect() as conn:
        conn.execute(
            """
            INSERT INTO work_logs
                (id, project_id, work, cost, work_date, note, created_by,
                 created_by_name, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            tuple(record[k] for k in
                  ("id", "project_id", "work", "cost", "work_date", "note",
                   "created_by", "created_by_name", "created_at")),
        )
    return _work_public(record, len(list_works(project_id)))


def delete_work(work_id: str, owner_username: str) -> bool:
    """A vendor may remove only their own entry. Used by the undo action."""
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            "DELETE FROM work_logs WHERE id = ? AND created_by = ?",
            (work_id, owner_username),
        )
        return cursor.rowcount > 0


def _work_public(row: dict[str, Any], sr_no: int) -> dict:
    return {
        "id": row["id"],
        "srNo": sr_no,
        "projectId": row["project_id"],
        "work": row["work"],
        "cost": row["cost"],
        "date": row["work_date"],
        "note": row.get("note"),
        "createdBy": row["created_by"],
        "createdByName": row["created_by_name"],
        "createdAt": row["created_at"],
    }
