#!/usr/bin/env python3
"""
Smart Nigrani System — API smoke test.

A dependency-free end-to-end check of the running FastAPI backend. It is meant
to be the thing you run before a demo: it signs in as both of the roles the
product has (mp and vendor), walks the real endpoints the dashboard uses, and
proves the role boundaries still hold.

Standard library only, deliberately. The point is that a teammate on a fresh
laptop with nothing installed can run it:

    python scripts/smoke_test.py
    python scripts/smoke_test.py http://localhost:8000

Exit code is 0 when every check passes, 1 otherwise. Every check runs even if
an earlier one fails, so one broken endpoint does not hide the rest.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
from urllib.parse import quote
import urllib.parse
import urllib.request

# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

DEFAULT_BASE = "http://127.0.0.1:8000"
DEMO_PASSWORD = "nigrani"
TIMEOUT = 30

BASE = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE).rstrip("/")

# The three sessions this script drives. Two MPs, because one MP is the only
# honest way to prove that another MP's data is hidden, and one vendor for the
# write side. The value is the role the API should report for that session.
SESSIONS = {"mp_a": "mp", "mp_b": "mp", "vendor": "vendor"}


# --------------------------------------------------------------------------
# terminal colours
# --------------------------------------------------------------------------

def _colours_enabled() -> bool:
    """
    Colour is a nicety, never a requirement. Piping the output to a file or to
    grep must produce clean plain text, and NO_COLOR is the cross-tool opt-out.
    """
    if os.environ.get("NO_COLOR"):
        return False
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


_COLOUR = _colours_enabled()


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOUR else text


GREEN = lambda s: paint(s, "32")   # noqa: E731
RED = lambda s: paint(s, "31")     # noqa: E731
DIM = lambda s: paint(s, "2")      # noqa: E731
BOLD = lambda s: paint(s, "1")     # noqa: E731


# --------------------------------------------------------------------------
# tiny HTTP client
# --------------------------------------------------------------------------

class Response:
    """Just enough of a response object to assert against."""

    def __init__(self, status: int, body: bytes, headers: dict):
        self.status = status
        self.headers = headers
        self.raw = body
        try:
            self.json = json.loads(body.decode("utf-8")) if body else None
        except (ValueError, UnicodeDecodeError):
            self.json = None

    def __repr__(self) -> str:
        preview = (self.raw or b"")[:200].decode("utf-8", "replace")
        return f"<{self.status} {preview}>"


def request(method: str, path: str, token: str | None = None, body=None) -> Response:
    """
    Perform one API call.

    Project ids contain slashes (WS/MP681/2024-2025/143652) and the routes use
    a :path converter, so callers pass ids already joined into `path` and we
    must NOT escape those slashes away here.
    """
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return Response(resp.status, resp.read(), dict(resp.headers))
    except urllib.error.HTTPError as exc:
        # 4xx/5xx are expected outcomes in many checks, not transport failures.
        return Response(exc.code, exc.read(), dict(exc.headers or {}))
    except urllib.error.URLError as exc:
        raise CheckFailed(f"cannot reach {url}: {exc.reason}") from None


def project_path(project_id: str, suffix: str = "") -> str:
    """Build /api/projects/<id><suffix>, escaping everything except the slashes."""
    return "/api/projects/" + urllib.parse.quote(project_id, safe="/") + suffix


def district_slug(name: str | None) -> str:
    """Fold a district name down to the form used in vendor usernames."""
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())


# --------------------------------------------------------------------------
# check framework
# --------------------------------------------------------------------------

class CheckFailed(Exception):
    """Raised by a check to report a clean, human-readable failure."""


CHECKS: list[tuple[str, callable]] = []


def check(name: str):
    """Register a function as a named check. Registration order is run order."""

    def wrap(fn):
        CHECKS.append((name, fn))
        return fn

    return wrap


def need(condition, message: str) -> None:
    if not condition:
        raise CheckFailed(message)


def need_keys(payload, keys, where: str) -> None:
    need(isinstance(payload, dict), f"{where}: expected a JSON object, got {type(payload).__name__}")
    missing = [k for k in keys if k not in payload]
    need(not missing, f"{where}: missing key(s) {', '.join(missing)}")


def need_status(resp: Response, expected: int, where: str) -> None:
    need(
        resp.status == expected,
        f"{where}: expected HTTP {expected}, got {resp.status} — {resp!r}",
    )


class Ctx:
    """
    Facts discovered by earlier checks and reused by later ones.

    Nothing here is hard-coded to one dataset. The demo-accounts endpoint hands
    us real usernames, the first MP's own project list tells us which district
    to sign in to as a vendor, and the second MP's project list gives us a
    record that is real but out of the first MP's reach. That keeps the script
    working after the data snapshot is regenerated.
    """

    def __init__(self) -> None:
        self.tokens: dict[str, str] = {}
        self.users: dict[str, dict] = {}
        self.demo_accounts: list[dict] = []
        self.usernames: dict[str, str] = {}          # session key -> username
        self.items: dict[str, list] = {}             # session key -> sample of its projects
        self.public_total = 0                        # /api/meta totalProjects
        self.scope_totals: dict[str, int] = {}
        self.shared_project_id: str | None = None    # visible to both mp_a and the vendor
        self.shared_detail: dict | None = None
        self.foreign_project_id: str | None = None   # the other MP's project
        self.outside_project_id: str | None = None   # outside the vendor's district
        self.created_work_ids: list[str] = []        # everything we must clean up


ctx = Ctx()


def token(session: str) -> str:
    tok = ctx.tokens.get(session)
    need(tok, f"no {session} token — the login check must pass first")
    return tok


def user_of(session: str) -> dict:
    """Signed-in account for a session, with a readable error if login never ran."""
    account = ctx.users.get(session)
    need(account, f"no {session} account — the login check must pass first")
    return account


# --------------------------------------------------------------------------
# 1-4. meta endpoints
# --------------------------------------------------------------------------

@check("GET / returns the service banner")
def check_root():
    resp = request("GET", "/")
    need_status(resp, 200, "GET /")
    need_keys(resp.json, ["name", "status", "projects", "snapshot"], "GET /")
    need(resp.json["status"] == "running", f"GET /: status is {resp.json['status']!r}")
    need(
        isinstance(resp.json["projects"], int) and resp.json["projects"] > 0,
        "GET /: project count should be a positive integer",
    )


@check("GET /api/health reports ok with a loaded dataset")
def check_health():
    resp = request("GET", "/api/health")
    need_status(resp, 200, "GET /api/health")
    need_keys(resp.json, ["ok", "projects", "accounts", "snapshot"], "GET /api/health")
    need(resp.json["ok"] is True, "GET /api/health: ok is not True")
    # accounts == 0 means the seeding step never ran; every login check below
    # would then fail for a reason that has nothing to do with the API.
    need(resp.json["accounts"] > 0, "GET /api/health: no accounts seeded")


@check("GET /api/meta is public and states the whole-dataset total")
def check_meta():
    # This endpoint is the yardstick for the scoping check further down: it is
    # the only number in the API that describes the dataset before any role
    # filter is applied, so it must stay reachable without a token.
    resp = request("GET", "/api/meta")
    need_status(resp, 200, "GET /api/meta")
    need_keys(
        resp.json,
        ["totalProjects", "districts", "constituencies", "members", "snapshot", "labelCounts"],
        "meta",
    )
    total = resp.json["totalProjects"]
    need(isinstance(total, int) and total > 0, f"meta.totalProjects is {total!r}")
    need(
        sum(resp.json["labelCounts"].values()) == total,
        f"meta: labelCounts sum {sum(resp.json['labelCounts'].values())} != totalProjects {total}",
    )
    ctx.public_total = total


@check("public highlights are readable without a token and name no MP")
def check_public_highlights():
    """
    The landing page shows real flagged works to visitors who are not signed
    in. The works themselves are published government records, but the member
    of parliament behind each one is deliberately withheld on a page that needs
    no sign-in, and that must stay true.
    """
    resp = request("GET", "/api/public/highlights?limit=3")
    need_status(resp, 200, "GET /api/public/highlights")
    need_keys(resp.json, ["snapshot", "flaggedTotal", "items"], "highlights")

    items = resp.json["items"]
    need(isinstance(items, list) and items, "highlights returned no items")
    need(len(items) <= 3, f"asked for 3 highlights, got {len(items)}")

    for item in items:
        need_keys(
            item,
            ["ref", "name", "district", "riskScore", "riskLabel", "reasons"],
            "highlight entry",
        )
        need("mp" not in item, "a public highlight carries an mp field")
        need(
            item["riskLabel"] != "Routine",
            "a routine work appeared in the highlights",
        )

    # Nothing routine, and ordered worst first.
    scores = [item["riskScore"] for item in items]
    need(scores == sorted(scores, reverse=True), f"highlights not ordered by score: {scores}")

    blob = json.dumps(resp.json).lower()
    need("password" not in blob, "public highlights leak a password field")


@check("GET /api/auth/demo-accounts offers mp and vendor sign-ins without a token")
def check_demo_accounts():
    resp = request("GET", "/api/auth/demo-accounts")
    need_status(resp, 200, "GET /api/auth/demo-accounts")
    need_keys(resp.json, ["accounts"], "demo accounts")
    # The shared demo password must NOT come back with this list. Printing a
    # working password in the interface is a bad habit to show a panel of
    # judges, and anything the API sends can be read out of the page source.
    body = json.dumps(resp.json).lower()
    need("password" not in body, "/api/auth/demo-accounts returns a password field")
    need(
        DEMO_PASSWORD.lower() not in body,
        "/api/auth/demo-accounts leaks the shared demo password",
    )
    accounts = resp.json["accounts"]
    need(isinstance(accounts, list) and accounts, "demo accounts list is empty")
    for account in accounts:
        need_keys(account, ["username", "name", "role", "scope"], "demo account entry")

    roles = sorted({account["role"] for account in accounts})
    # The product has exactly two roles. Anything else on this list is a stale
    # account that a judge could click and fail to sign in with.
    need(roles == ["mp", "vendor"], f"unexpected roles offered on the sign-in screen: {roles}")
    need(
        len([a for a in accounts if a["role"] == "mp"]) >= 2,
        "fewer than two MP accounts are advertised, so cross-MP scoping cannot be tested",
    )
    ctx.demo_accounts = accounts


@check("one-click demo sign-in works, and only for the advertised accounts")
def check_demo_login():
    """
    The sign-in screen signs a sample account in without the password crossing
    the wire. That shortcut must be limited to the accounts already on the
    public list, otherwise it would be a way into any account in the system.
    """
    need(ctx.demo_accounts, "no demo accounts were discovered")

    listed = ctx.demo_accounts[0]["username"]
    resp = request("POST", "/api/auth/demo-login", body={"username": listed})
    need_status(resp, 200, f"demo-login for the listed account {listed!r}")
    need_keys(resp.json, ["token", "user"], "demo-login response")
    need(
        resp.json["user"]["username"] == listed,
        "demo-login signed in as a different account than asked for",
    )

    advertised = {a["username"] for a in ctx.demo_accounts}
    # Find a real account that is NOT advertised, and confirm it is refused.
    hidden = next(
        (u for u in ctx.usernames.values() if u not in advertised),
        None,
    )
    if hidden:
        refused = request("POST", "/api/auth/demo-login", body={"username": hidden})
        need_status(
            refused, 403, f"demo-login should refuse the unlisted account {hidden!r}"
        )

    ghost = request("POST", "/api/auth/demo-login", body={"username": "no-such-user"})
    need_status(ghost, 403, "demo-login should refuse an account that does not exist")


# --------------------------------------------------------------------------
# 5-7. authentication
# --------------------------------------------------------------------------

def login(username: str, password: str = DEMO_PASSWORD) -> Response:
    return request("POST", "/api/auth/login", body={"username": username, "password": password})


@check("login succeeds for two different MPs and for a vendor")
def check_logins():
    need(ctx.demo_accounts, "the demo accounts check must pass first")
    candidates = [a["username"] for a in ctx.demo_accounts if a["role"] == "mp"]
    need(len(candidates) >= 2, "the demo account list offers fewer than two MP accounts")

    # Sign in as several MPs and keep the ones that actually own projects. An
    # MP with an empty scope proves nothing and would make later checks lie.
    signed: list[dict] = []
    for username in candidates:
        resp = login(username)
        need_status(resp, 200, f"login {username}")
        need_keys(resp.json, ["token", "user"], "login response")
        need(resp.json["user"]["role"] == "mp", f"login {username}: expected role 'mp'")
        listing = request("GET", "/api/projects?limit=50", token=resp.json["token"])
        need_status(listing, 200, f"project list for {username}")
        if listing.json["items"]:
            signed.append(
                {
                    "username": username,
                    "token": resp.json["token"],
                    "user": resp.json["user"],
                    "items": listing.json["items"],
                }
            )
        if len(signed) >= 4:
            break  # four is plenty; no need to sign in as every demo MP
    need(len(signed) >= 2, "fewer than two demo MP accounts have any projects")

    # mp_a has to be an MP one of whose districts has a vendor account, so that
    # a single project sits in both scopes. That is what makes the "vendor
    # writes, MP reads" check meaningful.
    chosen = None
    tried: set[str] = set()
    last_error = "no vendor account matched any district in the MPs' project lists"
    for entry in signed:
        for item in entry["items"]:
            slug = district_slug(item.get("district"))
            if not slug or slug in tried:
                continue
            tried.add(slug)
            attempt = login(f"vendor.{slug}")
            if attempt.status == 200:
                chosen = (entry, item, f"vendor.{slug}", attempt.json)
                break
            last_error = f"login vendor.{slug} returned {attempt.status}"
        if chosen:
            break
    need(chosen, last_error)

    mp_a, shared_item, vendor_username, vendor_payload = chosen
    ctx.tokens["mp_a"] = mp_a["token"]
    ctx.users["mp_a"] = mp_a["user"]
    ctx.usernames["mp_a"] = mp_a["username"]
    ctx.items["mp_a"] = mp_a["items"]
    ctx.shared_project_id = shared_item["id"]

    ctx.tokens["vendor"] = vendor_payload["token"]
    ctx.users["vendor"] = vendor_payload["user"]
    ctx.usernames["vendor"] = vendor_username
    need(user_of("vendor")["role"] == "vendor", "expected role 'vendor'")

    # mp_b is any other MP. Their projects are, by definition, foreign to mp_a.
    other = next((e for e in signed if e["username"] != mp_a["username"]), None)
    need(other, "could not find a second MP account with projects")
    ctx.tokens["mp_b"] = other["token"]
    ctx.users["mp_b"] = other["user"]
    ctx.usernames["mp_b"] = other["username"]
    ctx.items["mp_b"] = other["items"]

    listing = request("GET", "/api/projects?limit=50", token=token("vendor"))
    need_status(listing, 200, f"project list for {vendor_username}")
    ctx.items["vendor"] = listing.json["items"]


@check("login rejects a wrong password and an unknown username with 401")
def check_bad_logins():
    need(ctx.usernames.get("mp_a"), "the login check must pass first")
    resp = login(ctx.usernames["mp_a"], "definitely-not-the-password")
    need_status(resp, 401, "login with wrong password")

    resp = login("no.such.person.exists", DEMO_PASSWORD)
    need_status(resp, 401, "login with unknown username")
    # The wording must not differ between the two, or it tells an attacker
    # which usernames are real.
    need(
        isinstance(resp.json, dict) and "detail" in resp.json,
        "401 response should carry a 'detail' message",
    )


@check("GET /api/auth/me returns the signed-in account for every session")
def check_me():
    for session, expected_role in SESSIONS.items():
        resp = request("GET", "/api/auth/me", token=token(session))
        need_status(resp, 200, f"/api/auth/me as {session}")
        need(
            resp.json["username"] == user_of(session)["username"],
            f"/api/auth/me as {session}: got {resp.json['username']!r}, "
            f"expected {user_of(session)['username']!r}",
        )
        need(
            resp.json["role"] == expected_role,
            f"/api/auth/me as {session}: role is {resp.json['role']!r}, expected {expected_role!r}",
        )
        need("password" not in json.dumps(resp.json).lower(), "/api/auth/me leaks a password field")


# --------------------------------------------------------------------------
# 8-9. auth enforcement
# --------------------------------------------------------------------------

@check("a protected route without a token returns 401")
def check_anonymous_blocked():
    for path in ("/api/projects?limit=1", "/api/stats", "/api/auth/me"):
        resp = request("GET", path)
        need_status(resp, 401, f"unauthenticated GET {path}")


@check("a forged bearer token returns 401")
def check_forged_token():
    forged = [
        "not-a-token",
        # A well-formed JWT whose signature is garbage: the server must check
        # the signature, not just parse the claims.
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtcC5kZW1vIiwicm9sZSI6Im1wIn0.deadbeef",
        (token("mp_a") + "x") if ctx.tokens.get("mp_a") else "tampered",
    ]
    for bad in forged:
        resp = request("GET", "/api/projects?limit=1", token=bad)
        need_status(resp, 401, f"GET with forged token {bad[:24]!r}")


# --------------------------------------------------------------------------
# 10-11. role scoping
# --------------------------------------------------------------------------

@check("every signed-in scope is a strict subset of the public dataset")
def check_scope_sizes():
    need(ctx.public_total, "the /api/meta check must pass first")

    first_ids: dict[str, str] = {}
    for session in SESSIONS:
        resp = request("GET", "/api/projects?limit=1", token=token(session))
        need_status(resp, 200, f"project list as {session}")
        total = resp.json["total"]
        need(total > 0, f"{session} sees zero projects")
        # Scoping is only doing its job if it takes rows away. Seeing the whole
        # 4807-row dataset from inside a role would mean the filter is off.
        need(
            total < ctx.public_total,
            f"{session} sees {total} of {ctx.public_total} projects — "
            "a signed-in scope must be strictly smaller than the whole dataset",
        )
        ctx.scope_totals[session] = total
        need(resp.json["items"], f"{session}: project list page is empty despite total {total}")
        first_ids[session] = resp.json["items"][0]["id"]

    # Two MPs must not be looking at the same rows, or the constituency filter
    # is not being applied at all.
    need(
        (ctx.scope_totals["mp_a"], first_ids["mp_a"]) != (ctx.scope_totals["mp_b"], first_ids["mp_b"]),
        f"{ctx.usernames['mp_a']} and {ctx.usernames['mp_b']} see the same project set "
        f"({ctx.scope_totals['mp_a']} rows starting at {first_ids['mp_a']})",
    )


@check("an MP gets 404 for another MP's project id")
def check_foreign_project_hidden():
    # mp_b's own listing is the oracle: every row in it belongs to mp_b's
    # constituency, so any of them is a real id that mp_a must not be able to
    # read.
    need(ctx.items.get("mp_b"), "the login check must pass first")
    mine = {item["id"] for item in ctx.items.get("mp_a", [])}
    foreign = next((item for item in ctx.items["mp_b"] if item["id"] not in mine), None)
    need(foreign, "the two MP accounts returned overlapping project lists")
    ctx.foreign_project_id = foreign["id"]

    # 404 rather than 403 is deliberate: the API must not confirm that a record
    # it will not show you actually exists.
    resp = request("GET", project_path(foreign["id"]), token=token("mp_a"))
    need_status(resp, 404, f"{ctx.usernames['mp_a']} fetching foreign project {foreign['id']}")

    # And the reverse direction, so the check cannot pass by accident on an
    # account that simply sees nothing.
    resp = request("GET", project_path(foreign["id"]), token=token("mp_b"))
    need_status(resp, 200, f"{ctx.usernames['mp_b']} fetching their own project {foreign['id']}")


# --------------------------------------------------------------------------
# 12-13. project detail
# --------------------------------------------------------------------------

@check("project detail resolves an id containing slashes")
def check_project_detail():
    need(ctx.shared_project_id, "no project id discovered")
    # Slashes in the id are the fragile part of this API: the detail route has
    # to use a :path converter and must not be shadowed by /works.
    need("/" in ctx.shared_project_id, f"id {ctx.shared_project_id!r} has no slash to exercise")

    resp = request("GET", project_path(ctx.shared_project_id), token=token("mp_a"))
    need_status(resp, 200, f"GET detail {ctx.shared_project_id}")
    need_keys(
        resp.json,
        ["id", "name", "riskScore", "riskLabel", "signals", "scores", "lat", "lon"],
        "project detail",
    )
    need(
        resp.json["id"] == ctx.shared_project_id,
        f"detail returned id {resp.json['id']!r} for {ctx.shared_project_id!r}",
    )
    ctx.shared_detail = resp.json


@check("the signals array explains all four detectors")
def check_signals_shape():
    need(ctx.shared_detail, "project detail check must pass first")
    signals = ctx.shared_detail.get("signals")
    need(isinstance(signals, list), "signals is not a list")
    # Four detectors, always all four present even when inactive — the UI
    # renders a row per detector and would gap out if they were omitted.
    need(len(signals) == 4, f"expected 4 signals, got {len(signals)}")
    for signal in signals:
        need_keys(signal, ["key", "label", "score", "active", "explanation"], "signal entry")
        need(isinstance(signal["active"], bool), f"signal {signal['key']!r}: active is not a bool")
        need(
            isinstance(signal["score"], (int, float)),
            f"signal {signal['key']!r}: score is not numeric",
        )
    keys = sorted(s["key"] for s in signals)
    need(
        keys == ["cost", "delay", "duplicate", "payment"],
        f"unexpected signal keys: {keys}",
    )


# --------------------------------------------------------------------------
# 14-16. listing, filters, map
# --------------------------------------------------------------------------

@check("the Isolation Forest score reaches the project detail")
def check_anomaly():
    """
    The model is a second, independent opinion on each work. It must arrive
    with the project, and it must NOT be folded into the review priority,
    because that number has to stay explainable line by line.
    """
    need(ctx.shared_project_id, "no project id discovered")
    resp = request("GET", f"/api/projects/{ctx.shared_project_id}", token=token("mp_a"))
    need_status(resp, 200, "project detail")
    need("anomaly" in resp.json, "project detail has no anomaly field")

    anomaly = resp.json["anomaly"]
    if anomaly is None:
        # Legitimate: recommendations that were never sanctioned cannot be
        # scored, because the model was trained only on sanctioned works.
        return

    need_keys(anomaly, ["score", "percentile"], "anomaly")
    need(
        0 <= anomaly["score"] <= 1,
        f"anomaly score {anomaly['score']} is outside 0 to 1",
    )
    need(
        0 <= anomaly["percentile"] <= 100,
        f"anomaly percentile {anomaly['percentile']} is outside 0 to 100",
    )

    meta = request("GET", "/api/meta")
    need_status(meta, 200, "GET /api/meta")
    need(
        meta.json.get("scoredByModel", 0) > 0,
        "the dataset reports that the model scored nothing",
    )
    # The published weights must still add to 1, with no slot for the model.
    weights = meta.json["methodology"]["weights"]
    total = round(sum(weights.values()), 6)
    need(total == 1.0, f"review priority weights sum to {total}, not 1")
    need(
        "anomaly" not in weights and "model" not in weights,
        "the model has been folded into the review priority weights",
    )


@check("works can be filtered by the derived sector")
def check_sector():
    """
    The category column in the source files is useless (4,697 of 4,807 works
    say "Normal/Others"), so a sector is worked out from the description. It
    has to be offered as a filter, actually filter, and be declared as derived
    rather than passed off as published data.
    """
    filters = request("GET", "/api/projects/filters", token=token("mp_a"))
    need_status(filters, 200, "filters")
    need("sectors" in filters.json, "filters do not offer sectors")

    sectors = filters.json["sectors"]
    need(isinstance(sectors, list) and sectors, "sector list is empty")

    everything = request("GET", "/api/projects?limit=1", token=token("mp_a"))
    need_status(everything, 200, "unfiltered list")
    total = everything.json["total"]

    chosen = sectors[0]
    filtered = request(
        "GET",
        f"/api/projects?limit=200&sector={quote(chosen)}",
        token=token("mp_a"),
    )
    need_status(filtered, 200, f"list filtered by sector {chosen!r}")
    need(
        0 < filtered.json["total"] <= total,
        f"sector {chosen!r} returned {filtered.json['total']} of {total}",
    )
    for item in filtered.json["items"]:
        need(
            item.get("sector") == chosen,
            f"sector filter returned a {item.get('sector')!r} work for {chosen!r}",
        )

    nonsense = request(
        "GET", "/api/projects?limit=1&sector=definitely-not-a-sector", token=token("mp_a")
    )
    need_status(nonsense, 200, "unknown sector")
    need(nonsense.json["total"] == 0, "an unknown sector returned projects")

    charts = request("GET", "/api/stats/charts", token=token("mp_a"))
    need_status(charts, 200, "charts")
    need("bySector" in charts.json, "charts do not include bySector")

    meta = request("GET", "/api/meta")
    need(
        "sector" in (meta.json.get("derivedFields") or {}),
        "/api/meta does not declare that sector is a derived field",
    )
    need(meta.json.get("sectorCounts"), "/api/meta does not publish sector counts")


@check("pagination returns every project exactly once")
def check_pagination():
    limit = 25
    seen: list[str] = []
    page = 1
    pages = None

    # Walking the whole scope is the only way to catch an off-by-one in the
    # slice or an unstable sort that repeats a row on one page and drops it
    # from another.
    while True:
        resp = request("GET", f"/api/projects?page={page}&limit={limit}", token=token("mp_a"))
        need_status(resp, 200, f"MP project list page {page}")
        payload = resp.json
        need_keys(payload, ["items", "total", "page", "limit", "pages"], "project list")
        if pages is None:
            pages = payload["pages"]
            total = payload["total"]
        need(payload["page"] == page, f"page {page}: response says page {payload['page']}")
        seen.extend(item["id"] for item in payload["items"])
        if page >= pages:
            break
        page += 1
        need(page <= 1000, "pagination did not terminate")

    need(len(seen) == len(set(seen)), f"pagination repeated {len(seen) - len(set(seen))} id(s)")
    need(
        len(seen) == total,
        f"walked {len(seen)} items across {pages} page(s) but total says {total}",
    )


@check("filters endpoint returns every dropdown the dashboard needs")
def check_filters():
    resp = request("GET", "/api/projects/filters", token=token("mp_a"))
    need_status(resp, 200, "GET /api/projects/filters")
    need_keys(
        resp.json,
        ["districts", "categories", "statuses", "constituencies", "members", "riskLabels"],
        "filters",
    )
    for key, value in resp.json.items():
        need(isinstance(value, list), f"filters.{key} is not a list")
    need(
        resp.json["riskLabels"] == ["Critical Review", "High Review", "Medium Review", "Routine"],
        f"unexpected riskLabels: {resp.json['riskLabels']}",
    )
    # The filter lists are scoped, so an MP must not see other constituencies.
    need(len(resp.json["members"]) >= 1, "filters.members is empty for the MP")
    need(
        resp.json["members"] == [user_of("mp_a")["mpName"]],
        f"filters.members leaks other members to an MP: {resp.json['members']}",
    )


@check("map endpoint returns plottable points within the total")
def check_map():
    resp = request("GET", "/api/projects/map?limit=500", token=token("mp_a"))
    need_status(resp, 200, "GET /api/projects/map")
    need_keys(resp.json, ["points", "total", "shown", "truncated"], "map response")
    points = resp.json["points"]
    need(resp.json["shown"] == len(points), "map: shown does not match len(points)")
    # shown counts only the rows that survived the limit and had coordinates,
    # so it can never exceed the number of matching projects.
    need(
        resp.json["shown"] <= resp.json["total"],
        f"map: shown {resp.json['shown']} exceeds total {resp.json['total']}",
    )
    need(points, "map returned no points at all")
    for point in points[:50]:
        need_keys(point, ["id", "lat", "lon", "riskScore", "riskLabel"], "map point")
        need(
            isinstance(point["lat"], (int, float)) and isinstance(point["lon"], (int, float)),
            f"map point {point['id']}: lat/lon are not numeric",
        )


# --------------------------------------------------------------------------
# 17-19. stats
# --------------------------------------------------------------------------

@check("stats KPIs are internally consistent for every session")
def check_stats():
    # Run the arithmetic for all three scopes. A scoping bug shows up as totals
    # that stop adding up for one account while another still looks fine.
    for session in SESSIONS:
        _assert_kpis(session)


def _assert_kpis(session: str) -> None:
    resp = request("GET", "/api/stats", token=token(session))
    need_status(resp, 200, f"GET /api/stats as {session}")
    kpi = resp.json
    need_keys(
        kpi,
        [
            "scope", "snapshot", "totalProjects", "sanctioned", "recommendations",
            "activeProjects", "completedProjects", "delayedProjects",
            "flaggedProjects", "highRiskProjects", "totalBudget", "totalSpent",
            "utilisation", "districts", "riskCounts",
        ],
        "stats",
    )

    # Every project is either sanctioned or still only a recommendation.
    need(
        kpi["sanctioned"] + kpi["recommendations"] == kpi["totalProjects"],
        f"{session}: sanctioned {kpi['sanctioned']} + recommendations "
        f"{kpi['recommendations']} != totalProjects {kpi['totalProjects']}",
    )
    # Risk labels partition the same set, so the buckets must add back up.
    need(
        sum(kpi["riskCounts"].values()) == kpi["totalProjects"],
        f"{session}: riskCounts sum {sum(kpi['riskCounts'].values())} "
        f"!= totalProjects {kpi['totalProjects']}",
    )
    need(
        kpi["activeProjects"] + kpi["completedProjects"] == kpi["sanctioned"],
        f"{session}: active {kpi['activeProjects']} + completed "
        f"{kpi['completedProjects']} != sanctioned {kpi['sanctioned']}",
    )
    # "Flagged" is everything above Routine; high risk is a subset of that.
    need(
        kpi["flaggedProjects"] == kpi["totalProjects"] - kpi["riskCounts"]["Routine"],
        f"{session}: flaggedProjects does not match the non-Routine count",
    )
    need(
        kpi["highRiskProjects"] <= kpi["flaggedProjects"],
        f"{session}: highRiskProjects exceeds flaggedProjects",
    )
    need(
        0 <= kpi["utilisation"],
        f"{session}: utilisation is negative",
    )

    # The KPI header and the project table sit on the same screen, so a scope
    # mismatch between them would be visible to a judge mid-demo.
    listing = request("GET", "/api/projects?limit=1", token=token(session))
    need_status(listing, 200, f"project list as {session}")
    need(
        kpi["totalProjects"] == listing.json["total"],
        f"{session}: stats totalProjects {kpi['totalProjects']} "
        f"!= project list total {listing.json['total']}",
    )


@check("charts endpoint returns every series for both roles")
def check_charts():
    for session in ("mp_a", "vendor"):
        resp = request("GET", "/api/stats/charts", token=token(session))
        need_status(resp, 200, f"GET /api/stats/charts as {session}")
        need_keys(
            resp.json,
            ["byStatus", "byCategory", "byRisk", "byDistrict", "bySignal"],
            f"charts as {session}",
        )
        for key in ("byStatus", "byCategory", "byRisk", "byDistrict", "bySignal"):
            need(isinstance(resp.json[key], list), f"{session}: charts.{key} is not a list")
            need(resp.json[key], f"{session}: charts.{key} is empty")
        # All four labels/detectors are always present, even at zero, so the
        # legend does not change shape between accounts.
        need(len(resp.json["byRisk"]) == 4, f"{session}: charts.byRisk should carry all four labels")
        need(
            len(resp.json["bySignal"]) == 4,
            f"{session}: charts.bySignal should carry all four detectors",
        )
        for entry in resp.json["byDistrict"]:
            need_keys(entry, ["name", "count", "budget", "spent", "flagged"], "byDistrict entry")


@check("review queue is ordered by risk and excludes routine work")
def check_review_queue():
    populated = 0
    for session in SESSIONS:
        resp = request("GET", "/api/stats/review-queue?limit=25", token=token(session))
        need_status(resp, 200, f"GET /api/stats/review-queue as {session}")
        items = resp.json.get("items")
        need(isinstance(items, list), f"{session}: review queue items is not a list")
        if not items:
            # A clean scope genuinely can have nothing to review; that is only
            # a problem if it is true of every account we hold.
            continue
        populated += 1

        scores = [item["riskScore"] for item in items]
        need(
            scores == sorted(scores, reverse=True),
            f"{session}: review queue is not sorted by riskScore descending: {scores}",
        )
        # A routine record in the investigation queue would waste a reviewer's
        # time, which is the whole thing this queue exists to avoid.
        routine = [item["id"] for item in items if item["riskLabel"] == "Routine"]
        need(not routine, f"{session}: review queue contains Routine items: {routine}")
        for item in items[:5]:
            need_keys(item, ["id", "name", "riskScore", "riskLabel", "reasons"], "review queue item")
    need(populated, "the review queue was empty for every signed-in account")


# --------------------------------------------------------------------------
# 20-24. contractor work log
# --------------------------------------------------------------------------

def post_work(project_id: str, payload: dict, session: str = "vendor") -> Response:
    return request("POST", project_path(project_id, "/works"), token=token(session), body=payload)


@check("a vendor can add a work log entry")
def check_vendor_creates_work():
    need(ctx.shared_project_id, "no project id discovered")
    resp = post_work(
        ctx.shared_project_id,
        {
            "work": "Smoke test — foundation layer",
            "cost": 125000,
            "date": "2026-01-15",
            "note": "created by scripts/smoke_test.py",
        },
    )
    need_status(resp, 201, "vendor POST work entry")
    need_keys(
        resp.json,
        ["id", "srNo", "projectId", "work", "cost", "date", "createdBy",
         "exceedsBudget", "projectedTotal", "budget"],
        "work create response",
    )
    ctx.created_work_ids.append(resp.json["id"])

    need(resp.json["srNo"] >= 1, f"srNo should start at 1, got {resp.json['srNo']}")
    need(resp.json["cost"] == 125000, f"cost round-tripped as {resp.json['cost']}")
    need(
        resp.json["createdBy"] == ctx.usernames["vendor"],
        f"createdBy is {resp.json['createdBy']!r}, expected {ctx.usernames['vendor']!r}",
    )
    need(isinstance(resp.json["exceedsBudget"], bool), "exceedsBudget is not a bool")
    need(
        resp.json["projectedTotal"] >= resp.json["cost"],
        "projectedTotal should include at least the entry just added",
    )
    # The over-budget warning has to reflect the running total, because logging
    # over-spend is the point of the feature — it warns, it must not block.
    expected_flag = bool(resp.json["budget"]) and resp.json["projectedTotal"] > resp.json["budget"]
    need(
        resp.json["exceedsBudget"] == expected_flag,
        f"exceedsBudget {resp.json['exceedsBudget']} disagrees with "
        f"projectedTotal {resp.json['projectedTotal']} vs budget {resp.json['budget']}",
    )


@check("an MP can read the work log but cannot write to it")
def check_mp_read_only():
    need(ctx.created_work_ids, "the vendor create check must pass first")
    resp = request("GET", project_path(ctx.shared_project_id, "/works"), token=token("mp_a"))
    need_status(resp, 200, "MP GET work log")
    ids = [row["id"] for row in resp.json]
    need(
        ctx.created_work_ids[0] in ids,
        "the MP cannot see the entry the vendor just added to their own project",
    )

    # Oversight roles read the log; only the contractor doing the work writes to
    # it. 403 (not 404) is right here — the MP may see the project, just not act.
    resp = post_work(
        ctx.shared_project_id,
        {"work": "MP should not be able to log this", "cost": 1000, "date": "2026-01-16"},
        session="mp_a",
    )
    need_status(resp, 403, "MP POST work entry")


@check("invalid work entries are rejected with 422")
def check_work_validation():
    need(ctx.shared_project_id, "no project id discovered")
    cases = [
        ("empty work description", {"work": "", "cost": 1000, "date": "2026-01-15"}),
        ("whitespace-only work description", {"work": "     ", "cost": 1000, "date": "2026-01-15"}),
        ("zero cost", {"work": "Valid work", "cost": 0, "date": "2026-01-15"}),
        ("negative cost", {"work": "Valid work", "cost": -5000, "date": "2026-01-15"}),
        ("day-first date", {"work": "Valid work", "cost": 1000, "date": "01-01-2026"}),
        ("year out of range", {"work": "Valid work", "cost": 1000, "date": "1998-01-01"}),
    ]
    problems = []
    for label, payload in cases:
        resp = post_work(ctx.shared_project_id, payload)
        if resp.status != 422:
            problems.append(f"{label}: got HTTP {resp.status}")
        # If a bad payload was accepted anyway, remember it so cleanup removes it.
        if resp.status == 201 and isinstance(resp.json, dict) and resp.json.get("id"):
            ctx.created_work_ids.append(resp.json["id"])
    need(not problems, "payloads that should have been rejected: " + "; ".join(problems))


@check("a vendor can delete their own entry, and only once")
def check_delete_work():
    need(ctx.shared_project_id, "no project id discovered")
    created = post_work(
        ctx.shared_project_id,
        {"work": "Smoke test — entry to be deleted", "cost": 5000, "date": "2026-02-01"},
    )
    need_status(created, 201, "vendor POST entry for delete test")
    work_id = created.json["id"]
    ctx.created_work_ids.append(work_id)

    resp = request(
        "DELETE", project_path(ctx.shared_project_id, f"/works/{work_id}"), token=token("vendor")
    )
    need_status(resp, 200, "vendor DELETE own entry")
    need(resp.json.get("deleted") == work_id, f"delete response: {resp!r}")
    ctx.created_work_ids.remove(work_id)

    # Deleting again must 404 rather than silently succeed, otherwise the undo
    # button would report success for a row that no longer exists.
    resp = request(
        "DELETE", project_path(ctx.shared_project_id, f"/works/{work_id}"), token=token("vendor")
    )
    need_status(resp, 404, "vendor DELETE the same entry twice")


@check("a vendor cannot log work on a project outside their district")
def check_vendor_district_boundary():
    vendor_district = (user_of("vendor").get("districtKey") or "").lower()
    need(vendor_district, "vendor account has no districtKey")
    vendor_district = district_slug(vendor_district)

    # The MPs' own listings are the source of real, existing ids. An MP usually
    # spans several districts, so one of their rows sits outside the district
    # this vendor is allowed to touch.
    outside = _find_outside_project(vendor_district)
    need(outside, "could not find a project outside the vendor's district")
    ctx.outside_project_id = outside["id"]

    resp = post_work(
        outside["id"],
        {"work": "Should never be recorded", "cost": 1000, "date": "2026-01-15"},
    )
    # 404, not 403: a contractor should not learn which projects exist elsewhere.
    need_status(resp, 404, f"vendor POST to out-of-district project {outside['id']}")
    if resp.status == 201 and isinstance(resp.json, dict) and resp.json.get("id"):
        ctx.created_work_ids.append(resp.json["id"])

    # Reading it must be blocked the same way.
    resp = request("GET", project_path(outside["id"]), token=token("vendor"))
    need_status(resp, 404, f"vendor GET out-of-district project {outside['id']}")


def _find_outside_project(vendor_district: str) -> dict | None:
    """First project in either MP's scope whose district is not the vendor's."""
    for session in ("mp_a", "mp_b"):
        for item in ctx.items.get(session, []):
            slug = district_slug(item.get("district"))
            if slug and slug != vendor_district:
                return item

    # The cached page was all one district; page further through both MPs.
    for session in ("mp_a", "mp_b"):
        for page in range(1, 6):
            resp = request(
                "GET", f"/api/projects?page={page}&limit=100", token=token(session)
            )
            need_status(resp, 200, f"project list as {session}")
            for item in resp.json["items"]:
                slug = district_slug(item.get("district"))
                if slug and slug != vendor_district:
                    return item
            if page >= resp.json["pages"]:
                break
    return None


@check("the smoke test leaves no work log entries behind")
def check_cleanup():
    """Runs last. The API is a live demo database, so we must not litter it."""
    need(ctx.shared_project_id, "no project id discovered")
    failures = []
    for work_id in list(ctx.created_work_ids):
        resp = request(
            "DELETE",
            project_path(ctx.shared_project_id, f"/works/{work_id}"),
            token=token("vendor"),
        )
        if resp.status != 200:
            failures.append(f"{work_id} -> HTTP {resp.status}")
        else:
            ctx.created_work_ids.remove(work_id)
    need(not failures, "could not delete: " + "; ".join(failures))

    # Confirm against the server rather than trusting our own bookkeeping.
    resp = request("GET", project_path(ctx.shared_project_id, "/works"), token=token("vendor"))
    need_status(resp, 200, "GET work log after cleanup")
    leftovers = [
        row["id"]
        for row in resp.json
        if str(row.get("work", "")).startswith("Smoke test")
        or str(row.get("note", "") or "").startswith("created by scripts/smoke_test.py")
    ]
    need(not leftovers, f"smoke test rows still in the database: {leftovers}")


# --------------------------------------------------------------------------
# runner
# --------------------------------------------------------------------------

def main() -> int:
    width = max(len(name) for name, _ in CHECKS) + 2

    print()
    print(BOLD("Smart Nigrani System API smoke test"))
    print(DIM(f"target: {BASE}"))
    print()

    # Probe once before running anything. If the API is simply not up, 24
    # identical "cannot reach" lines tell the reader nothing a single clear
    # sentence would not.
    try:
        request("GET", "/api/health")
    except CheckFailed as exc:
        print(RED(f"the API is not reachable — {exc}"))
        print(DIM("start it with:  uvicorn app.main:app --reload --port 8000"))
        print()
        return 1

    passed = 0
    failures: list[tuple[str, str]] = []

    for name, fn in CHECKS:
        try:
            fn()
        except CheckFailed as exc:
            failures.append((name, str(exc)))
            print(f"{RED('FAIL')}  {name.ljust(width)} {DIM(str(exc))}")
        except Exception as exc:  # an unexpected crash is still a failed check
            reason = f"{type(exc).__name__}: {exc}"
            failures.append((name, reason))
            print(f"{RED('FAIL')}  {name.ljust(width)} {DIM(reason)}")
        else:
            passed += 1
            print(f"{GREEN('PASS')}  {name}")

    print()
    if failures:
        print(BOLD("failures"))
        for name, reason in failures:
            print(f"  {RED('x')} {name}")
            print(f"    {reason}")
        print()

    summary = f"{passed} passed, {len(failures)} failed"
    print(BOLD(GREEN(summary) if not failures else RED(summary)))
    print()
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted")
        sys.exit(1)
