"""
The one part of the API that needs no sign-in.

The landing page shows a few real flagged works so a visitor can see what the
system actually produces, rather than a description of it. Everything here is
drawn from MPLADS reports that are already published by the government, so
nothing secret is being handed out.

Two things are deliberately held back even so:

* No member of parliament's name. The work is a public record; putting a named
  individual beside the word "critical" on a page with no sign-in is a
  different thing, and not one this project needs to do.
* No contractor work-log entries. Those are written inside the system and are
  not public records at all.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from .. import store

router = APIRouter(prefix="/api/public", tags=["public"])


# Severity as a small number, so the landing page payload stays compact.
SEVERITY_RANK = {
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

    flagged = [p for p in index.projects if p.get("riskLabel") != "Routine"]
    flagged = store.ProjectIndex.sort(flagged, "risk")[:limit]

    return {
        "snapshot": index.snapshot,
        "flaggedTotal": sum(
            1 for p in index.projects if p.get("riskLabel") != "Routine"
        ),
        "items": [
            {
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
