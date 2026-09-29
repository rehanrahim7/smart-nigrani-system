"""
The one part of the API that needs no sign-in.

The landing page shows a few real flagged works so a visitor can see what the
system actually produces, rather than a description of it. Everything here is
drawn from MPLADS reports that are already published by the government, so
nothing secret is being handed out.

Two things are deliberately held back even so:

* No member of parliament's name, and no constituency, which names one just
  as surely. The work is a public record; putting a named individual beside
  the word "critical" on a page with no sign-in is a different thing, and not
  one this project needs to do. Members appear as MP 01 to MP 47.
* No payee names from the expenditure report, for the same reason.
* Nothing written inside the system: no work log, photographs or reviews.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from .. import store

router = APIRouter(prefix="/api/public", tags=["public"])


# Severity as a small number, so the landing page payload stays compact.
UNFLAGGED = ("Routine", "Not checked")

SEVERITY_RANK = {
    "Not checked": 0,
    "Routine": 0,
    "Medium Review": 1,
    "High Review": 2,
    "Critical Review": 3,
}


@router.get("/map")
def public_map() -> dict:
    """
    Every work as a dot, for the picture on the landing page.

    Only three values per work: latitude, longitude, and how much attention it
    needs. No name, no amount, no member of parliament. That is enough to draw
    the distribution and not enough to identify anything.

    Sent as plain arrays rather than objects because the key names would
    otherwise be repeated 4,807 times and triple the size of the response.
    Coordinates are rounded to three decimal places, which is about 100 metres
    and far finer than the district-level accuracy the source data supports.
    """
    index = store.projects()

    points = [
        [round(p["lat"], 3), round(p["lon"], 3), SEVERITY_RANK.get(p["riskLabel"], 0)]
        for p in index.projects
        if p.get("lat") is not None and p.get("lon") is not None
    ]

    lats = [p[0] for p in points]
    lons = [p[1] for p in points]

    return {
        "points": points,
        "count": len(points),
        "bounds": {
            "minLat": min(lats) if lats else 0,
            "maxLat": max(lats) if lats else 0,
            "minLon": min(lons) if lons else 0,
            "maxLon": max(lons) if lons else 0,
        },
        "legend": ["Routine", "Medium", "High", "Critical"],
    }


@router.get("/highlights")
def highlights(limit: int = Query(3, ge=1, le=12)) -> dict:
    index = store.projects()

    flagged = [p for p in index.projects if p.get("riskLabel") not in UNFLAGGED]
    flagged = store.ProjectIndex.sort(flagged, "risk")[:limit]

    return {
        "snapshot": index.snapshot,
        "flaggedTotal": sum(1 for p in index.projects if p.get("riskLabel") not in UNFLAGGED),
        "items": [
            {
                "id": p["id"],
                "ref": p["anonId"],
                "name": p["name"],
                "district": p["district"],
                "budget": p["budget"],
                "totalPaid": p["totalPaid"],
                "status": p["status"],
                "riskScore": p["riskScore"],
                "riskLabel": p["riskLabel"],
                "scores": p["scores"],
                "reasons": [
                    {"label": s["label"], "explanation": s["explanation"]}
                    for s in (p.get("signals") or [])
                    if s.get("active") and s.get("explanation")
                ],
            }
            for p in flagged
        ],
    }


# ---------------------------------------------------------------------------
# public browsing
# ---------------------------------------------------------------------------

# What a public row may carry. Everything identifying a person is left out.
PUBLIC_SUMMARY = (
    "id", "anonId", "name", "workType", "sector", "district", "mpAlias", "areaAlias",
    "status", "stage", "budget", "totalPaid", "sanctionDate", "completionDate",
    "fourChecks", "riskScore", "riskLabel", "primaryReason", "activeSignals", "scores",
    "ruleScore", "anomaly", "lat", "lon",
)

PUBLIC_DETAIL_DROP = {
    "mp", "constituency", "peerGroup", "authorityAlias",
}


def _public_row(p: dict) -> dict:
    row = {k: p.get(k) for k in PUBLIC_SUMMARY}
    row["checks"] = [c["title"] for c in p.get("checks") or []]
    return row


def _public_brief(p: dict) -> dict:
    return {
        "id": p["id"], "anonId": p.get("anonId"), "name": p.get("name"), "district": p.get("district"),
        "budget": p.get("budget"), "sanctionAmount": p.get("sanctionAmount"),
        "sanctionDate": p.get("sanctionDate"), "status": p.get("status"), "riskLabel": p.get("riskLabel"),
        "linkable": True,
    }


@router.get("/works")
def public_works(
    search: str | None = None,
    district: str | None = None,
    sector: str | None = None,
    risk: str | None = None,
    member: str | None = None,
    sort: str = "risk",
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
) -> dict:
    """Every work in the snapshot, searchable, with members as aliases only."""
    index = store.projects()
    rows = index.filter(index.projects, district=district, sector=sector, risk=risk)
    if member and member != "all":
        rows = [p for p in rows if p.get("mpAlias") == member]
    if search and search.strip():
        # Public search looks only at public fields. Matching on a member's
        # name or constituency would let anyone pair a name with an alias.
        needle = search.strip().lower()
        rows = [
            p for p in rows
            if any(needle in (p.get(k) or "").lower() for k in ("name", "id", "anonId", "district", "workType", "sector", "mpAlias"))
        ]
    rows = store.ProjectIndex.sort(rows, sort if sort in ("risk", "amount", "recent", "name", "model") else "risk")
    total = len(rows)
    window = rows[(page - 1) * limit : page * limit]
    return {
        "items": [_public_row(p) for p in window],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/filters")
def public_filters() -> dict:
    index = store.projects()
    return {
        "districts": index.districts,
        "sectors": sorted({p["sector"] for p in index.projects if p.get("sector")}),
        "members": sorted({p["mpAlias"] for p in index.projects if p.get("mpAlias")}),
        "riskLabels": ["Critical Review", "High Review", "Medium Review", "Routine", "Not checked"],
    }


@router.get("/works/{project_id:path}")
def public_work(project_id: str) -> dict:
    """
    One work in full, as the public may see it: the source rows it came from,
    payments without payee names, the checks and their reasons, the comparison
    group, similar descriptions and the model's separate opinion.
    """
    index = store.projects()
    project = index.by_id.get(project_id)
    if not project:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Work not found")
    detail = {k: v for k, v in project.items() if k not in PUBLIC_DETAIL_DROP}
    detail["source"] = "mplads"
    detail["payments"] = [{**pay, "vendor": None} for pay in project.get("payments") or []]
    detail["snapshot"] = index.snapshot
    detail["peers"] = [_public_brief(p) for p in sorted(index.peers_of(project), key=lambda p: p.get("sanctionAmount") or 0)]
    detail["similar"] = [
        {**_public_brief(index.by_id[s["id"]]), "similarity": s["similarity"]}
        for s in project.get("similar") or []
        if s["id"] in index.by_id
    ]
    match = project.get("duplicateMatch") or {}
    if match.get("id") and match["id"] in index.by_id:
        other = index.by_id[match["id"]]
        detail["duplicateMatch"] = {
            **match, "name": other.get("name"), "budget": other.get("budget"),
            "district": other.get("district"), "status": other.get("status"),
            "sanctionDate": other.get("sanctionDate"), "linkable": True,
        }
    detail["works"], detail["evidence"], detail["reviews"] = [], [], []
    return detail


@router.get("/network")
def network(
    sector: str | None = None,
    district: str | None = None,
    risk: str | None = None,
    per_member: int = Query(4, ge=1, le=12),
) -> dict:
    """
    The picture on the front page: each member (as an alias) joined to their
    works that most need a look. Capped per member so the drawing stays
    readable; the counts say how many works each member has in total.
    """
    index = store.projects()
    return build_network(index, index.filter(index.projects, sector=sector, district=district, risk=risk), per_member)


def build_network(index: store.ProjectIndex, rows: list[dict], per_member: int, names: bool = False) -> dict:
    by_member: dict[str, list[dict]] = {}
    for p in rows:
        if p.get("mpAlias"):
            by_member.setdefault(p["mpAlias"], []).append(p)
    members = []
    works = []
    for alias in sorted(by_member):
        own = store.ProjectIndex.sort(by_member[alias], "risk")
        districts = [p.get("district") for p in own if p.get("district")]
        member = {
            "alias": alias,
            "works": len(own),
            "flagged": sum(1 for p in own if p.get("riskLabel") not in UNFLAGGED),
            "district": max(set(districts), key=districts.count) if districts else None,
        }
        if names:
            member["name"] = own[0].get("mp")
        members.append(member)
        for p in own[:per_member]:
            works.append({
                "id": p["id"], "anonId": p["anonId"], "mpAlias": alias, "name": p["name"],
                "sector": p["sector"], "district": p["district"], "budget": p["budget"],
                "riskLabel": p["riskLabel"], "riskScore": p["riskScore"],
            })
    return {"members": members, "works": works, "total": len(rows)}
