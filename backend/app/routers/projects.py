"""Project listing, map points, filter options and project detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from .. import store
from ..deps import current_user, visible_project

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Fields sent in list and map views. The full record is roughly six times this
# size; sending only what a row draws keeps the first paint fast.
SUMMARY_FIELDS = (
    "id",
    "anonId",
    "name",
    "category",
    "sector",
    "district",
    "constituency",
    "mp",
    "status",
    "budget",
    "totalPaid",
    "paymentRatio",
    "sanctionDate",
    "completionDate",
    "lat",
    "lon",
    "riskScore",
    "riskLabel",
    "primaryReason",
    "activeSignals",
    "scores",
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
)


def _pick(project: dict, fields) -> dict:
    return {key: project.get(key) for key in fields}


def _query_set(user: dict, params: dict) -> list[dict]:
    index = store.projects()
    return index.filter(index.scoped(user), **params)


def _filter_params(
    search: str | None,
    district: str | None,
    category: str | None,
    sector: str | None,
    status: str | None,
    risk: str | None,
    constituency: str | None,
    member: str | None,
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
    sort: str = "risk",
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
) -> dict:
    rows = _query_set(
        user,
        _filter_params(search, district, category, sector, status, risk, constituency, member),
    )
    rows = store.ProjectIndex.sort(rows, sort)

    total = len(rows)
    start = (page - 1) * limit
    window = rows[start : start + limit]

    # Attach contractor work-log totals only for the rows actually on screen.
    summaries = store.works_summary([p["id"] for p in window])

    items = []
    for project in window:
        row = _pick(project, SUMMARY_FIELDS)
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
    limit: int = Query(2000, ge=1, le=5000),
) -> dict:
    rows = _query_set(
        user,
        _filter_params(search, district, category, sector, status, risk, constituency, member),
    )
    total = len(rows)

    # Highest review priority first, so if the cap trims anything it trims the
    # routine works rather than the ones that need attention.
    rows = store.ProjectIndex.sort(rows, "risk")
    points = [_pick(p, MAP_FIELDS) for p in rows[:limit] if p.get("lat") is not None]

    return {
        "points": points,
        "total": total,
        "shown": len(points),
        "truncated": total > len(points),
    }


@router.get("/filters")
def filter_options(user: dict = Depends(current_user)) -> dict:
    """Dropdown options, limited to what this user can actually see."""
    index = store.projects()
    rows = index.scoped(user)
    return {
        "districts": sorted({p["district"] for p in rows if p.get("district")}),
        "categories": sorted({p["category"] for p in rows if p.get("category")}),
        "sectors": sorted({p["sector"] for p in rows if p.get("sector")}),
        "statuses": sorted({p["status"] for p in rows if p.get("status")}),
        "constituencies": sorted({p["constituency"] for p in rows if p.get("constituency")}),
        "members": sorted({p["mp"] for p in rows if p.get("mp")}),
        "riskLabels": ["Critical Review", "High Review", "Medium Review", "Routine"],
    }


@router.get("/{project_id:path}")
def project_detail(project_id: str, user: dict = Depends(current_user)) -> dict:
    """
    Full record including the explainable risk breakdown.

    The path converter is :path because MPLADS work ids contain slashes, e.g.
    WS/MP681/2024-2025/143652.
    """
    project = visible_project(project_id, user)
    index = store.projects()

    detail = dict(project)
    detail["works"] = store.list_works(project["id"])
    detail["workLogged"] = sum(w["cost"] for w in detail["works"])

    # Resolve the duplicate match into something the UI can link to, but only
    # if the matched work is inside this user's scope.
    match = project.get("duplicateMatch") or {}
    if match.get("id"):
        other = index.by_id.get(match["id"])
        if other:
            # Only offer a link to the matched work if the caller is allowed
            # to open it. Default to NOT linkable so an unexpected role can
            # never be handed a route into a record outside its scope.
            visible = False
            if user["role"] == "mp" and user.get("mpName"):
                visible = other.get("mp") == user["mpName"]
            elif user["role"] == "vendor" and user.get("districtKey"):
                visible = other.get("districtKey") == user["districtKey"]
            detail["duplicateMatch"] = {
                **match,
                "name": other.get("name"),
                "budget": other.get("budget"),
                "district": other.get("district"),
                "status": other.get("status"),
                "linkable": visible,
            }

    return detail
