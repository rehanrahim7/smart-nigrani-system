"""Data access.

Three kinds of data live here:

* Projects from the MPLADS reports. Read-only, loaded once from
  data/projects.json into memory. 4,798 records is small enough that in-memory
  filtering is faster than any database round trip, and it means the demo
  keeps working with no network at all. A research analyst can also import a
  newer export of the same reports; each import is kept as its own dataset
  file under data/datasets/ and never replaces the original.

* Projects registered inside the system by an implementing agency. These are
  new works, stored in SQLite, and shaped like the MPLADS records so every
  list, map and timeline treats them the same way.

* Everything people write: accounts, contractor work logs, field evidence,
  review decisions, model-assisted photo notes. SQLite is the only live write
  path; there is no runtime Supabase code here. Supabase is an EXPORT target,
  populated by scripts/sync_supabase.py, not a second backend the app reads
  from.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import unicodedata
from datetime import date, datetime, timezone
from typing import Any, Iterable

from . import config
from .security import hash_password

_LOCK = threading.Lock()

# The five roles. "vendor" is the contractor; the technical name is kept
# because stored accounts and tokens already use it.
ROLES = ("mp", "vendor", "officer", "agency", "analyst")

# Roles tied to one member of parliament's works: the member and the people
# who deliver those works.
TEAM_ROLES = ("mp", "vendor", "officer", "agency")

# Only these roles are sent what the four checks and the model found. The
# people who build and record the work are not shown a verdict on it.
RISK_ROLES = ("mp", "analyst")

DATASETS_DIR = config.DATA_DIR / "datasets"
BASE_DATASET = "base"


# --------------------------------------------------------------------------
# projects (read-only, in memory)
# --------------------------------------------------------------------------

class ProjectIndex:
    def __init__(self, payload: dict) -> None:
        self.generated_at: str = payload.get("generatedAt", "")
        self.snapshot: str = payload.get("snapshot", "")
        self.meta: dict = payload.get("meta", {})
        self.summary: dict = payload.get("summary", {})
        self.allocations: list[dict] = payload.get("allocations", [])
        self.projects: list[dict] = payload.get("projects", [])
        self.by_id: dict[str, dict] = {p["id"]: p for p in self.projects}

        # Pre-computed lowercase blob per project so search does not rebuild
        # strings on every keystroke.
        self._search_blob: dict[str, str] = {p["id"]: _blob(p) for p in self.projects}

        # Comparison groups for the record checks: same implementing agency,
        # same kind of work, same sanction year. Only works with a positive
        # sanctioned amount take part, exactly as in the pipeline.
        self.peer_groups: dict[str, list[str]] = {}
        for p in self.projects:
            if (p.get("sanctionAmount") or 0) > 0 and p.get("peerGroup") is not None:
                self.peer_groups.setdefault(p["peerGroup"], []).append(p["id"])

        self.districts = sorted({p["district"] for p in self.projects if p.get("district")})
        self.members = sorted({p["mp"] for p in self.projects if p.get("mp")})

    def peers_of(self, project: dict) -> list[dict]:
        """The comparison set behind peerStats, excluding the work itself."""
        if not project.get("peerStats"):
            return []
        ids = self.peer_groups.get(project.get("peerGroup"), [])
        return [self.by_id[i] for i in ids if i != project["id"]]

    # -- scoping -----------------------------------------------------------

    def scoped(self, user: dict | None) -> list[dict]:
        """
        Restrict the visible project set to what this user is allowed to see.

        MP, contractor, field officer, agency -> the works of one member
        analyst                               -> every work in the dataset

        A contractor, officer or agency account is tied to one member, so the
        whole team looks at exactly the same list of works. That is the point:
        when a contractor records work against a project, the member watching
        that project sees it on their own screen.

        An account that somehow reaches here without a usable scope gets
        NOTHING rather than everything — failing closed is the only safe
        default for a system about public money.

        The anonymous case (the public pages) returns the full set; the public
        routes strip names before anything leaves the server.
        """
        if not user:
            return self.projects

        role = user.get("role")
        if role == "analyst":
            return self.projects
        if role in TEAM_ROLES and user.get("mpName"):
            target = user["mpName"]
            return [p for p in self.projects if p.get("mp") == target]

        # Older contractor accounts, created before accounts were paired to a
        # member, only carry a district. Kept working so a database from an
        # earlier build does not lock anyone out.
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
        checks: str | None = None,
        source: str | None = None,
    ) -> list[dict]:
        out = list(rows)

        if search:
            needle = _normalise(search)
            if needle:
                out = [p for p in out if needle in (self._search_blob.get(p["id"]) or _blob(p))]

        if district and district != "all":
            out = [p for p in out if p.get("district") == district]
        if constituency and constituency != "all":
            out = [p for p in out if p.get("constituency") == constituency]
        if member and member != "all":
            out = [p for p in out if p.get("mp") == member or p.get("mpAlias") == member]
        if category and category != "all":
            out = [p for p in out if p.get("category") == category]
        if sector and sector != "all":
            out = [p for p in out if p.get("sector") == sector]
        if status and status != "all":
            out = [p for p in out if p.get("status") == status]
        if source and source != "all":
            out = [p for p in out if p.get("source", "mplads") == source]
        if risk and risk != "all":
            if risk == "flagged":
                # Anything above Routine — the working review queue.
                out = [p for p in out if p.get("riskLabel") not in ("Routine", "Not checked")]
            else:
                out = [p for p in out if p.get("riskLabel") == risk]
        if checks and checks != "all":
            if checks == "any":
                out = [p for p in out if p.get("checks")]
            else:
                out = [p for p in out if any(c["kind"] == checks for c in p.get("checks") or [])]
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
        if key == "model":
            return sorted(
                rows,
                key=lambda p: (-((p.get("anomaly") or {}).get("percentile") or -1), p["id"]),
            )
        if key == "rules":
            return sorted(rows, key=lambda p: (-(p.get("ruleScore") or 0), -(p.get("budget") or 0), p["id"]))
        # Default: highest review priority first, then largest budget, then a
        # stable id tiebreak so pagination never repeats or drops a row.
        return sorted(
            rows,
            key=lambda p: (-(p.get("riskScore") or 0), -(p.get("budget") or 0), p["id"]),
        )


def _blob(p: dict) -> str:
    return " ".join(
        filter(
            None,
            (
                p.get("name"),
                p.get("id"),
                p.get("anonId"),
                p.get("district"),
                p.get("constituency"),
                p.get("mp"),
                p.get("mpAlias"),
                p.get("category"),
                p.get("workType"),
                p.get("sector"),
                p.get("agency"),
            ),
        )
    ).lower()


def _normalise(value: str) -> str:
    """Lowercase and strip accents so 'Nashik' matches 'nashik'."""
    folded = unicodedata.normalize("NFKD", value or "")
    return "".join(c for c in folded if not unicodedata.combining(c)).strip().lower()


_index: ProjectIndex | None = None
_imported: dict[str, ProjectIndex] = {}


def projects() -> ProjectIndex:
    """The dataset the whole system runs on: the 2026-09-09 MPLADS snapshot."""
    global _index
    if _index is None:
        if not config.PROJECTS_FILE.exists():
            raise RuntimeError(
                f"{config.PROJECTS_FILE} not found. Run: python scripts/prepare_data.py"
            )
        with config.PROJECTS_FILE.open(encoding="utf-8") as fh:
            _index = ProjectIndex(json.load(fh))
    return _index


def dataset_index(dataset_id: str) -> ProjectIndex | None:
    """A dataset by id: the base snapshot, or one a research analyst imported."""
    if dataset_id == BASE_DATASET:
        return projects()
    if dataset_id in _imported:
        return _imported[dataset_id]
    path = DATASETS_DIR / f"{dataset_id}.json"
    if not dataset_id.replace("-", "").isalnum() or not path.exists():
        return None
    with path.open(encoding="utf-8") as fh:
        _imported[dataset_id] = ProjectIndex(json.load(fh))
    return _imported[dataset_id]


# --------------------------------------------------------------------------
# sqlite
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

-- Works registered inside the system by an implementing agency.
CREATE TABLE IF NOT EXISTS registered_projects (
    id          TEXT PRIMARY KEY,
    mp_name     TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    sector      TEXT NOT NULL,
    district    TEXT,
    budget      INTEGER NOT NULL,
    sanctioned  TEXT NOT NULL,
    deadline    TEXT NOT NULL,
    contractor  TEXT NOT NULL,
    officer     TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- Photographs from the field, kept in the database rather than on disk so
-- a backup is one file and nothing is ever served from a public folder.
CREATE TABLE IF NOT EXISTS evidence (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    photo           BLOB NOT NULL,
    sha256          TEXT NOT NULL,
    note            TEXT NOT NULL,
    stage           TEXT,
    progress        INTEGER,
    lat             REAL,
    lng             REAL,
    accuracy        REAL,
    flags           TEXT NOT NULL DEFAULT '[]',
    created_by      TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    role            TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS evidence_project ON evidence (project_id, created_at);
CREATE INDEX IF NOT EXISTS evidence_hash ON evidence (sha256);

-- Review decisions and follow-up actions. Append only: a changed mind is a
-- new row, so the history of who decided what is never lost.
CREATE TABLE IF NOT EXISTS reviews (
    id              TEXT PRIMARY KEY,
    dataset_id      TEXT NOT NULL,
    project_id      TEXT NOT NULL,
    target_kind     TEXT NOT NULL,
    target_id       TEXT,
    decision        TEXT NOT NULL,
    note            TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    role            TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reviews_project ON reviews (dataset_id, project_id, created_at);

-- Photo descriptions returned by the Gemini API, one per photograph.
CREATE TABLE IF NOT EXISTS vision_notes (
    id          TEXT PRIMARY KEY,
    evidence_id TEXT NOT NULL UNIQUE,
    project_id  TEXT NOT NULL,
    model       TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vision_usage (
    username TEXT NOT NULL,
    day      TEXT NOT NULL,
    count    INTEGER NOT NULL,
    PRIMARY KEY (username, day)
);

-- Datasets a research analyst imported. The file holds the records; this
-- row holds who imported it and what it contains.
CREATE TABLE IF NOT EXISTS datasets (
    id         TEXT PRIMARY KEY,
    owner      TEXT NOT NULL,
    name       TEXT NOT NULL,
    as_of      TEXT NOT NULL,
    summary    TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
    username   TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL
);
"""

# Columns added to work_logs after the first release. Older databases get them
# on startup, so an existing laptop copy keeps its entries.
WORK_LOG_COLUMNS = {
    "items": "TEXT",
    "stage": "TEXT",
    "progress": "INTEGER",
    "flags": "TEXT",
    "client_id": "TEXT",
}


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
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(work_logs)")}
        for column, kind in WORK_LOG_COLUMNS.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE work_logs ADD COLUMN {column} {kind}")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS work_logs_client ON work_logs (client_id)")
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)


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


def add_team_member(*, username: str, password: str, name: str, role: str, lead: dict) -> dict:
    """
    An agency adds a contractor or field officer to its member's team. The new
    account inherits the member it works for, which is what scopes its view.
    Refuses an existing username rather than overwriting somebody's account.
    """
    import uuid

    with _LOCK, connect() as conn:
        taken = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if taken:
            raise ValueError("That username is already taken")
        conn.execute(
            """
            INSERT INTO users
                (id, username, password_hash, name, role, mp_name, district_key,
                 constituency, organisation, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            (
                f"user-{role}-{uuid.uuid4().hex[:10]}",
                username,
                hash_password(password),
                name,
                role,
                lead["mpName"],
                lead.get("districtKey"),
                lead.get("constituency"),
                f"{ADDED_BY}{lead['username']}",
                now_iso(),
            ),
        )
    return user_public(get_user(username))


def team(mp_name: str) -> list[dict]:
    """Everyone working on one member's works, member first."""
    order = {role: i for i, role in enumerate(TEAM_ROLES)}
    with connect() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM users WHERE mp_name = ?", (mp_name,)
        ).fetchall()]
    rows.sort(key=lambda r: (order.get(r["role"], 9), r["created_at"], r["username"]))
    return [
        {"username": r["username"], "name": r["name"], "role": r["role"], "createdAt": r["created_at"]}
        for r in rows
    ]


def remove_unsupported_roles(allowed: set[str]) -> int:
    """Delete accounts whose role is not in `allowed`. Returns how many went."""
    placeholders = ",".join("?" * len(allowed))
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            f"DELETE FROM users WHERE role NOT IN ({placeholders})", tuple(sorted(allowed))
        )
        return cursor.rowcount


def count_unpaired_vendors() -> int:
    """
    Contractor accounts left over from before accounts were paired to a member.

    A database built by an earlier version of this project still holds them,
    and they are scoped by district rather than by member, which is exactly the
    mismatch that let a contractor record work against a project their member
    could not see. Startup uses this to notice and re-seed.
    """
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM users "
            "WHERE role = 'vendor' AND (mp_name IS NULL OR mp_name = '')"
        ).fetchone()
    return row["n"] if row else 0


def count_role(role: str) -> int:
    with connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users WHERE role = ?", (role,)).fetchone()["n"]


def remove_unpaired_vendors() -> int:
    """
    Delete contractor accounts that were never attached to a member.

    Re-seeding updates accounts in place rather than replacing the table, so
    without this a database built by an earlier version would keep its old
    district-scoped contractor logins alongside the new paired ones.
    """
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            "DELETE FROM users WHERE role = 'vendor' AND (mp_name IS NULL OR mp_name = '')"
        )
        return cursor.rowcount


def vendor_for_mp(mp_name: str) -> dict | None:
    """The contractor account attached to this member, if one has been seeded."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE role = 'vendor' AND mp_name = ? LIMIT 1",
            (mp_name,),
        ).fetchone()
    return dict(row) if row else None


def count_works_by(username: str) -> int:
    """How many entries this contractor has recorded, across all projects."""
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM work_logs WHERE created_by = ?", (username,)
        ).fetchone()
    return row["n"] if row else 0


def count_evidence_by(username: str) -> int:
    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM evidence WHERE created_by = ?", (username,)).fetchone()
    return row["n"] if row else 0


def count_users() -> int:
    with connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


SAMPLE_ROLES = ("mp", "vendor", "officer", "agency", "analyst")

# Marks an account an agency created. Those are real team members, not
# samples, so they are never offered for one-click sign-in.
ADDED_BY = "Added by "


def sample_logins(per_role: int = 6) -> list[dict]:
    """
    Accounts to offer on the sign-in screen, so nobody has to be told a
    username to look around.

    Ranked by how much there is to see, not alphabetically: every team role is
    ordered by how many flagged works its member has. Ranking every role the
    same way means the first member, the first contractor, the first officer
    and the first agency on offer are one team looking at the same works,
    which is what makes the "contractor records, member sees it" walkthrough
    work with accounts taken straight off this list.
    """
    index = projects()

    flagged_by_mp: dict[str, int] = {}
    flagged_by_district: dict[str, int] = {}
    for project in index.projects:
        if project.get("riskLabel") in ("Routine", "Not checked"):
            continue
        if project.get("mp"):
            flagged_by_mp[project["mp"]] = flagged_by_mp.get(project["mp"], 0) + 1
        key = project.get("districtKey")
        if key:
            flagged_by_district[key] = flagged_by_district.get(key, 0) + 1

    with connect() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT username, name, role, constituency, district_key, mp_name, organisation FROM users"
        ).fetchall()]

    def interest(row: dict) -> int:
        if row["mp_name"]:
            return flagged_by_mp.get(row["mp_name"], 0)
        return flagged_by_district.get(row["district_key"] or "", 0)

    out: list[dict] = []
    for role in SAMPLE_ROLES:
        ranked = sorted(
            (r for r in rows if r["role"] == role and not (r["organisation"] or "").startswith(ADDED_BY)),
            key=lambda r: (-interest(r), r["username"]),
        )
        out.extend(ranked[: (2 if role == "analyst" else per_role)])

    return [
        {
            "username": r["username"],
            "name": r["name"],
            "role": r["role"],
            "scope": r["constituency"] or r["district_key"] or ("All works" if r["role"] == "analyst" else ""),
        }
        for r in out
    ]


# -- registered projects ---------------------------------------------------

def add_registered_project(record: dict) -> bool:
    """Insert once. Returns False if this id was already saved (a retried submit)."""
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO registered_projects
                (id, mp_name, title, description, sector, district, budget, sanctioned,
                 deadline, contractor, officer, created_by, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            tuple(record[k] for k in (
                "id", "mp_name", "title", "description", "sector", "district", "budget",
                "sanctioned", "deadline", "contractor", "officer", "created_by", "created_at",
            )),
        )
        return cursor.rowcount > 0


def registered_rows(mp_name: str | None = None) -> list[dict]:
    with connect() as conn:
        if mp_name:
            rows = conn.execute(
                "SELECT * FROM registered_projects WHERE mp_name = ? ORDER BY created_at DESC", (mp_name,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM registered_projects ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def registered_row(project_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM registered_projects WHERE id = ?", (project_id,)).fetchone()
    return dict(row) if row else None


def count_registered(mp_name: str) -> int:
    with connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) AS n FROM registered_projects WHERE mp_name = ?", (mp_name,)
        ).fetchone()["n"]


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


def work_by_client_id(client_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM work_logs WHERE client_id = ?", (client_id,)).fetchone()
    return dict(row) if row else None


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


def prior_rates(material: str, unit: str, exclude_project: str | None = None) -> list[float]:
    """
    Every rate earlier claimed in this system for the same material and unit,
    across all projects. Used to say when a new claim's rate is far above what
    other contractors have entered, which is a comparison with real entries
    rather than with an invented price list.
    """
    rates: list[float] = []
    with connect() as conn:
        rows = conn.execute(
            "SELECT project_id, items FROM work_logs WHERE items IS NOT NULL"
        ).fetchall()
    key = (material.strip().lower(), unit.strip().lower())
    for row in rows:
        if exclude_project and row["project_id"] == exclude_project:
            continue
        for item in json.loads(row["items"] or "[]"):
            if (item["material"].strip().lower(), item["unit"].strip().lower()) == key:
                rates.append(float(item["rate"]))
    return rates


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
    items: list[dict] | None = None,
    stage: str | None = None,
    progress: int | None = None,
    flags: list[str] | None = None,
    client_id: str | None = None,
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
        "items": json.dumps(items) if items else None,
        "stage": stage,
        "progress": progress,
        "flags": json.dumps(flags or []),
        "client_id": client_id,
    }
    columns = tuple(record)
    with _LOCK, connect() as conn:
        conn.execute(
            f"INSERT INTO work_logs ({','.join(columns)}) VALUES ({','.join('?' * len(columns))})",
            tuple(record[k] for k in columns),
        )
    return _work_public(record, len(list_works(project_id)))


def delete_work(work_id: str, owner_username: str) -> bool:
    """A vendor may remove only their own entry. Used by the undo action."""
    with _LOCK, connect() as conn:
        reviewed = conn.execute(
            "SELECT 1 FROM reviews WHERE target_kind = 'worklog' AND target_id = ?", (work_id,)
        ).fetchone()
        if reviewed:
            # Once somebody has recorded a decision on an entry, removing the
            # entry would leave that decision pointing at nothing.
            return False
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
        "items": json.loads(row["items"]) if row.get("items") else None,
        "stage": row.get("stage"),
        "progress": row.get("progress"),
        "flags": json.loads(row["flags"]) if row.get("flags") else [],
    }


# -- field evidence --------------------------------------------------------

def add_evidence(record: dict) -> bool:
    columns = tuple(record)
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            f"INSERT OR IGNORE INTO evidence ({','.join(columns)}) VALUES ({','.join('?' * len(columns))})",
            tuple(record[k] for k in columns),
        )
        return cursor.rowcount > 0


def hash_seen(sha256: str) -> list[dict]:
    """Earlier photographs with exactly the same bytes, anywhere in the system."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, project_id, created_at FROM evidence WHERE sha256 = ?", (sha256,)
        ).fetchall()
    return [dict(r) for r in rows]


def list_evidence(project_id: str) -> list[dict]:
    """Evidence for one work, without the photo bytes; those have their own route."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT e.id, e.project_id, e.sha256, e.note, e.stage, e.progress, e.lat, e.lng,
                   e.accuracy, e.flags, e.created_by, e.created_by_name, e.role, e.created_at,
                   length(e.photo) AS bytes, v.text AS vision, v.model AS vision_model,
                   v.created_at AS vision_at
            FROM evidence e LEFT JOIN vision_notes v ON v.evidence_id = e.id
            WHERE e.project_id = ? ORDER BY e.created_at ASC
            """,
            (project_id,),
        ).fetchall()
    return [_evidence_public(dict(r)) for r in rows]


def get_evidence(evidence_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
    return dict(row) if row else None


def _evidence_public(row: dict) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "sha256": row["sha256"],
        "note": row["note"],
        "stage": row["stage"],
        "progress": row["progress"],
        "lat": row["lat"],
        "lng": row["lng"],
        "accuracy": row["accuracy"],
        "flags": json.loads(row["flags"] or "[]"),
        "createdBy": row["created_by"],
        "createdByName": row["created_by_name"],
        "role": row["role"],
        "createdAt": row["created_at"],
        "bytes": row.get("bytes"),
        "vision": {"text": row["vision"], "model": row["vision_model"], "createdAt": row["vision_at"]}
        if row.get("vision")
        else None,
    }


# -- model-assisted photo notes (Gemini) ------------------------------------

def vision_note(evidence_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM vision_notes WHERE evidence_id = ?", (evidence_id,)).fetchone()
    return dict(row) if row else None


def add_vision_note(record: dict) -> None:
    columns = tuple(record)
    with _LOCK, connect() as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO vision_notes ({','.join(columns)}) VALUES ({','.join('?' * len(columns))})",
            tuple(record[k] for k in columns),
        )


def take_vision_quota(username: str, limit: int) -> bool:
    """Count one request against today's allowance. False once it is used up."""
    day = date.today().isoformat()
    with _LOCK, connect() as conn:
        row = conn.execute(
            "SELECT count FROM vision_usage WHERE username = ? AND day = ?", (username, day)
        ).fetchone()
        used = row["count"] if row else 0
        if used >= limit:
            return False
        conn.execute(
            "INSERT INTO vision_usage (username, day, count) VALUES (?,?,1) "
            "ON CONFLICT(username, day) DO UPDATE SET count = count + 1",
            (username, day),
        )
    return True


def give_back_vision_quota(username: str) -> None:
    """A request that never reached the provider should not use up the allowance."""
    day = date.today().isoformat()
    with _LOCK, connect() as conn:
        conn.execute(
            "UPDATE vision_usage SET count = MAX(count - 1, 0) WHERE username = ? AND day = ?",
            (username, day),
        )


# -- reviews ---------------------------------------------------------------

def add_review(record: dict) -> bool:
    columns = tuple(record)
    with _LOCK, connect() as conn:
        cursor = conn.execute(
            f"INSERT OR IGNORE INTO reviews ({','.join(columns)}) VALUES ({','.join('?' * len(columns))})",
            tuple(record[k] for k in columns),
        )
        return cursor.rowcount > 0


def get_review(review_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM reviews WHERE id = ?", (review_id,)).fetchone()
    return dict(row) if row else None


def list_reviews(dataset_id: str, project_id: str, viewer: dict) -> list[dict]:
    """
    Review history for one work.

    Decisions on a submission (a work log entry or a photograph) are part of
    the delivery record and every team member can read them: a contractor
    needs to see that clarification was requested. A decision on the work as a
    whole is a reviewer's own judgement and stays with the person who wrote it.
    """
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM reviews WHERE dataset_id = ? AND project_id = ?
              AND (target_kind != 'work' OR created_by = ?)
            ORDER BY created_at ASC
            """,
            (dataset_id, project_id, viewer["username"]),
        ).fetchall()
    return [_review_public(dict(r)) for r in rows]


def reviews_by(username: str, dataset_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM reviews WHERE created_by = ? AND dataset_id = ? ORDER BY created_at DESC",
            (username, dataset_id),
        ).fetchall()
    return [_review_public(dict(r)) for r in rows]


def _review_public(row: dict) -> dict:
    return {
        "id": row["id"],
        "datasetId": row["dataset_id"],
        "projectId": row["project_id"],
        "targetKind": row["target_kind"],
        "targetId": row["target_id"],
        "decision": row["decision"],
        "note": row["note"],
        "createdBy": row["created_by"],
        "createdByName": row["created_by_name"],
        "role": row["role"],
        "createdAt": row["created_at"],
    }


# -- activity feed ---------------------------------------------------------

def activity(project_ids: list[str], limit: int = 60) -> list[dict]:
    """
    The newest work log entries, photographs, submission reviews and photo
    notes across a set of works, newest first. Feeds a member's "Updates and
    alerts" list.
    """
    if not project_ids:
        return []
    out: list[dict] = []
    with connect() as conn:
        for start in range(0, len(project_ids), 400):
            chunk = project_ids[start : start + 400]
            marks = ",".join("?" * len(chunk))
            for row in conn.execute(
                f"SELECT id, project_id, work, cost, flags, created_by_name, created_at, items "
                f"FROM work_logs WHERE project_id IN ({marks})",
                chunk,
            ):
                items = json.loads(row["items"]) if row["items"] else None
                out.append({
                    "kind": "worklog", "id": row["id"], "projectId": row["project_id"],
                    "title": row["work"], "amount": row["cost"], "itemCount": len(items) if items else 0,
                    "flags": json.loads(row["flags"] or "[]"), "by": row["created_by_name"],
                    "at": row["created_at"],
                })
            for row in conn.execute(
                f"SELECT id, project_id, note, flags, created_by_name, created_at "
                f"FROM evidence WHERE project_id IN ({marks})",
                chunk,
            ):
                out.append({
                    "kind": "evidence", "id": row["id"], "projectId": row["project_id"],
                    "title": "Field photograph submitted", "note": row["note"],
                    "flags": json.loads(row["flags"] or "[]"), "by": row["created_by_name"],
                    "at": row["created_at"],
                })
            for row in conn.execute(
                f"SELECT id, project_id, decision, note, target_kind, created_by_name, created_at "
                f"FROM reviews WHERE project_id IN ({marks}) AND target_kind != 'work'",
                chunk,
            ):
                out.append({
                    "kind": "review", "id": row["id"], "projectId": row["project_id"],
                    "title": row["decision"], "note": row["note"], "flags": [],
                    "by": row["created_by_name"], "at": row["created_at"],
                })
    out.sort(key=lambda item: item["at"], reverse=True)
    return out[:limit]


# -- research datasets -----------------------------------------------------

def add_dataset(*, dataset_id: str, owner: str, name: str, as_of: str, summary: dict) -> None:
    with _LOCK, connect() as conn:
        conn.execute(
            "INSERT INTO datasets (id, owner, name, as_of, summary, created_at) VALUES (?,?,?,?,?,?)",
            (dataset_id, owner, name, as_of, json.dumps(summary), now_iso()),
        )


def list_datasets(owner: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM datasets WHERE owner = ? ORDER BY created_at DESC", (owner,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "asOf": r["as_of"],
            "createdAt": r["created_at"],
            "summary": json.loads(r["summary"]),
            "owner": r["owner"],
        }
        for r in rows
    ]


def dataset_owner(dataset_id: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT owner FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
    return row["owner"] if row else None


def active_dataset(username: str) -> str:
    with connect() as conn:
        row = conn.execute("SELECT dataset_id FROM preferences WHERE username = ?", (username,)).fetchone()
    return row["dataset_id"] if row else BASE_DATASET


def set_active_dataset(username: str, dataset_id: str) -> None:
    with _LOCK, connect() as conn:
        conn.execute(
            "INSERT INTO preferences (username, dataset_id) VALUES (?,?) "
            "ON CONFLICT(username) DO UPDATE SET dataset_id = excluded.dataset_id",
            (username, dataset_id),
        )
