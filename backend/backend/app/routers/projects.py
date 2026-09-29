"""Project listing, map points, filter options and project detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from .. import delivery, store
from ..deps import can_see, current_user, dataset_for, sees_risk, visible_project

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Fields sent in list and map views. The full record is many times this size;
# sending only what a row draws keeps the first paint fast.
SUMMARY_FIELDS = (
    "id",
    "anonId",
    "source",
    "name",
    "category",
    "workType",
    "sector",
    "district",
    "constituency",
    "mp",
    "mpAlias",
    "status",
    "stage",
    "budget",
    "totalPaid",
    "paymentRatio",
    "sanctionDate",
    "completionDate",
    "deadline",
    "lat",
    "lon",
    "fourChecks",
    "riskScore",
    "riskLabel",
    "primaryReason",
    "activeSignals",
    "scores",
    "ruleScore",
    "checks",
    "anomaly",
)

MAP_FIELDS = (
    "id",
    "name",
    "district",
    "lat",
    "lon",
    "riskScore",
    "riskLabel",
    "budget",
    "status",
    "locationPrecision",
    "source",
)


# Everything the four checks, the record checks and the model produced. Only
# oversight roles receive these. A contractor, field officer or agency records
# and delivers the work; judging the record is the member's and the analyst's
# side of the system, so the numbers are not merely hidden in the browser,
# they are never sent.
RISK_FIELDS = (
    "riskScore",
    "riskLabel",
    "primaryReason",
    "activeSignals",
    "scores",
    "signals",
    "anomaly",
    "peer",
    "duplicateMatch",
    "checks",
    "ruleScore",
    "similar",
    "peerStats",
    "peerGroup",
    "fourChecks",
)


def _pick(project: dict, fields) -> dict:
    return {key: project.get(key) for key in fields}


def _strip_risk(row: dict) -> dict:
    """Remove every check result from a record before it leaves the server."""
    return {key: value for key, value in row.items() if key not in RISK_FIELDS}


def visible_rows(user: dict, dataset: str | None = None) -> tuple[str, store.ProjectIndex, list[dict]]:
    """The MPLADS works in scope, plus registered projects for a delivery team."""
    dataset_id, index = dataset_for(user, dataset)
    rows = index.scoped(user) + delivery.registered_for(user)
    return dataset_id, index, rows


def _query_set(user: dict, params: dict, dataset: str | None = None) -> tuple[store.ProjectIndex, list[dict]]:
    _, index, rows = visible_rows(user, dataset)
    if not sees_risk(user):
        # Filtering by risk would hand the check results over a row at a time:
        # ask for the flagged ones, and whatever comes back is flagged. Hiding
        # the score but leaving the filter open would be no protection at all.
        params = {**params, "risk": None, "checks": None}
    return index, index.filter(rows, **params)


def _sort_key(user: dict, requested: str) -> str:
    """Ordering by any score would leak the ranking, so only oversight roles can ask."""
    if requested in ("risk", "model", "rules") and not sees_risk(user):
        return "recent"
    return requested


def _filter_params(
    search: str | None,
    district: str | None,
    category: str | None,
    sector: str | None,
    status: str | None,
    risk: str | None,
    constituency: str | None,
    member: str | None,
    checks: str | None = None,
    source: str | None = None,
) -> dict:
    return {
        "search": search,
        "district": district,
        "category": category,
        "sector": sector,
        "status": status,
        "risk": risk,
        "constituency": constituency,
        "member": member,
        "checks": checks,
        "source": source,
    }


@router.get("")
def list_projects(
    user: dict = Depends(current_user),
    search: str | None = None,
    district: str | None = None,
    category: str | None = None,
    sector: str | None = None,
    status: str | None = None,
    risk: str | None = None,
    constituency: str | None = None,
    member: str | None = None,
    checks: str | None = None,
    source: str | None = None,
    dataset: str | None = None,
    sort: str = "risk",
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
) -> dict:
    _, rows = _query_set(
        user,
        _filter_params(search, district, category, sector, status, risk, constituency, member, checks, source),
        dataset,
    )
    rows = store.ProjectIndex.sort(rows, _sort_key(user, sort))

    total = len(rows)
    start = (page - 1) * limit
    window = rows[start : start + limit]

    # Attach contractor work-log totals only for the rows actually on screen.
    summaries = store.works_summary([p["id"] for p in window])

    show_risk = sees_risk(user)

    items = []
    for project in window:
        row = _pick(project, SUMMARY_FIELDS)
        row["source"] = project.get("source", "mplads")
        row["checks"] = [c["title"] for c in project.get("checks") or []]
        if not show_risk:
            row = _strip_risk(row)
        logged = summaries.get(project["id"])
        row["workEntries"] = logged["entries"] if logged else 0
        row["workLogged"] = logged["total"] if logged else 0
        items.append(row)

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/map")
def map_points(
    user: dict = Depends(current_user),
    search: str | None = None,
    district: str | None = None,
    category: str | None = None,
    sector: str | None = None,
    status: str | None = None,
    risk: str | None = None,
    constituency: str | None = None,
    member: str | None = None,
    checks: str | None = None,
    source: str | None = None,
    dataset: str | None = None,
    limit: int = Query(2000, ge=1, le=5000),
) -> dict:
    _, rows = _query_set(
        user,
        _filter_params(search, district, category, sector, status, risk, constituency, member, checks, source),
        dataset,
    )
    total = len(rows)

    # Highest review priority first, so if the cap trims anything it trims the
    # routine works rather than the ones that need attention.
    rows = store.ProjectIndex.sort(rows, _sort_key(user, "risk"))
    points = [_pick(p, MAP_FIELDS) for p in rows[:limit] if p.get("lat") is not None]
    for point in points:
        point["source"] = point.get("source") or "mplads"
    if not sees_risk(user):
        points = [_strip_risk(point) for point in points]

    return {
        "points": points,
        "total": total,
        "shown": len(points),
        "truncated": total > len(points),
    }


@router.get("/filters")
def filter_options(user: dict = Depends(current_user), dataset: str | None = None) -> dict:
    """Dropdown options, limited to what this user can actually see."""
    _, _, rows = visible_rows(user, dataset)
    return {
        "districts": sorted({p["district"] for p in rows if p.get("district")}),
        "categories": sorted({p["category"] for p in rows if p.get("category")}),
        "sectors": sorted({p["sector"] for p in rows if p.get("sector")}),
        "statuses": sorted({p["status"] for p in rows if p.get("status")}),
        "constituencies": sorted({p["constituency"] for p in rows if p.get("constituency")}),
        "members": sorted({p["mp"] for p in rows if p.get("mp")}),
        # No risk dropdown for a delivery role, because there is no risk
        # filter for them to apply.
        "riskLabels": (
            ["Critical Review", "High Review", "Medium Review", "Routine", "Not checked"]
            if sees_risk(user)
            else []
        ),
        "checkKinds": (
            sorted({c["kind"] for p in rows for c in p.get("checks") or []}) if sees_risk(user) else []
        ),
    }


def _brief(project: dict, user: dict) -> dict:
    """A short reference to another work, for peer and similar-work lists."""
    return {
        "id": project["id"],
        "anonId": project.get("anonId"),
        "name": project.get("name"),
        "district": project.get("district"),
        "budget": project.get("budget"),
        "sanctionAmount": project.get("sanctionAmount"),
        "sanctionDate": project.get("sanctionDate"),
        "status": project.get("status"),
        "riskLabel": project.get("riskLabel"),
        "linkable": can_see(project, user),
    }


@router.get("/{project_id:path}")
def project_detail(project_id: str, user: dict = Depends(current_user), dataset: str | None = None) -> dict:
    """
    Full record: the source rows it came from, payments, the explainable
    checks, its comparison group, similar descriptions, and everything the
    delivery team has recorded against it.

    The path converter is :path because MPLADS work ids contain slashes, e.g.
    WS/MP681/2024-2025/143652.
    """
    project = visible_project(project_id, user, dataset)
    dataset_id, index = dataset_for(user, dataset)

    detail = dict(project)
    detail["source"] = project.get("source", "mplads")
    detail["datasetId"] = dataset_id
    detail["snapshot"] = index.snapshot
    detail["works"] = store.list_works(project["id"])
    detail["workLogged"] = sum(w["cost"] for w in detail["works"])
    detail["evidence"] = store.list_evidence(project["id"])
    detail["reviews"] = store.list_reviews(dataset_id, project["id"], user)
    detail["reportedProgress"] = delivery.latest_progress(project["id"])
    if detail["source"] == "registered":
        detail["overdueDays"] = delivery.overdue_days(project)

    # A delivery role gets the record, the payments, the work log and the
    # photographs, and nothing the checks produced. Stripping here rather than
    # in the browser means the scores are genuinely absent, not just not drawn.
    if not sees_risk(user):
        return _strip_risk(detail)

    # The comparison group behind the record checks' amount rule.
    peers = index.peers_of(project)
    detail["peers"] = [_brief(p, user) for p in sorted(peers, key=lambda p: p.get("sanctionAmount") or 0)]

    # Works with near-identical descriptions (word overlap), resolved to names.
    detail["similar"] = [
        {**_brief(index.by_id[s["id"]], user), "similarity": s["similarity"]}
        for s in project.get("similar") or []
        if s["id"] in index.by_id
    ]

    # Resolve the four-check duplicate match into something the UI can link to.
    match = project.get("duplicateMatch") or {}
    if match.get("id"):
        other = index.by_id.get(match["id"])
        if other:
            detail["duplicateMatch"] = {
                **match,
                "name": other.get("name"),
                "budget": other.get("budget"),
                "district": other.get("district"),
                "status": other.get("status"),
                "sanctionDate": other.get("sanctionDate"),
                "linkable": can_see(other, user),
            }

    return detail
