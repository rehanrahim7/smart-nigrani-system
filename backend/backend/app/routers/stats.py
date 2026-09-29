"""Dashboard KPIs, chart aggregates and the review queue.

Mirrors the "Top-Level KPIs" and "Main Visualizations" list in section 5.18 of
the project brief.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Query

from .. import store
from ..deps import current_user, require_roles, sees_risk
from .projects import visible_rows

router = APIRouter(prefix="/api/stats", tags=["stats"])

RISK_ORDER = ["Critical Review", "High Review", "Medium Review", "Routine", "Not checked"]
UNFLAGGED = ("Routine", "Not checked")


def _is_completed(project: dict) -> bool:
    status = (project.get("status") or "").lower()
    return project.get("hasCompletionRecord") or "completed" in status


def _is_delayed(project: dict) -> bool:
    """Delay detector fired, using the team's own >= 60 threshold."""
    return (project.get("scores") or {}).get("delay", 0) >= 60


@router.get("")
def kpis(user: dict = Depends(current_user), dataset: str | None = None) -> dict:
    _, index, rows = visible_rows(user, dataset)

    total = len(rows)
    sanctioned = [p for p in rows if p.get("sanctioned")]
    completed = [p for p in rows if _is_completed(p)]
    delayed = [p for p in rows if _is_delayed(p)]
    flagged = [p for p in rows if p.get("riskLabel") not in UNFLAGGED]
    high_risk = [p for p in rows if p.get("riskLabel") in ("Critical Review", "High Review")]

    budget = sum(p.get("budget") or 0 for p in rows)
    spent = sum(p.get("totalPaid") or 0 for p in rows)

    out = {
        "scope": _scope_label(user),
        "snapshot": index.snapshot,
        "totalProjects": total,
        "sanctioned": len(sanctioned),
        "recommendations": total - len(sanctioned),
        "activeProjects": len(sanctioned) - len(completed),
        "completedProjects": len(completed),
        "totalBudget": budget,
        "totalSpent": spent,
        "utilisation": round(spent / budget, 4) if budget else 0,
        "districts": len({p["district"] for p in rows if p.get("district")}),
        "registered": sum(1 for p in rows if p.get("source") == "registered"),
    }

    if sees_risk(user):
        out.update(
            {
                "delayedProjects": len(delayed),
                "flaggedProjects": len(flagged),
                "highRiskProjects": len(high_risk),
                "riskCounts": {
                    label: sum(1 for p in rows if p.get("riskLabel") == label)
                    for label in RISK_ORDER
                },
                "withRecordChecks": sum(1 for p in rows if p.get("checks")),
                "scoredByModel": sum(1 for p in rows if p.get("anomaly")),
            }
        )
    else:
        # A delivery role gets a count of their own work instead of a count of
        # flagged works. It is the number that is useful to the person doing
        # the entering, and it carries no judgement of the record.
        out["myEntries"] = store.count_works_by(user["username"])
        out["myEvidence"] = store.count_evidence_by(user["username"])

    return out


@router.get("/charts")
def charts(
    user: dict = Depends(require_roles("mp", "analyst")),
    top: int = Query(8, ge=3, le=25),
    dataset: str | None = None,
) -> dict:
    """Every chart here counts works by how the checks scored them, so this is
    for oversight roles only."""
    _, index, rows = visible_rows(user, dataset)

    by_status: Counter[str] = Counter()
    by_category: Counter[str] = Counter()
    by_sector: Counter[str] = Counter()
    by_risk: Counter[str] = Counter()
    district_budget: dict[str, dict] = defaultdict(
        lambda: {"count": 0, "budget": 0, "spent": 0, "flagged": 0}
    )
    signal_totals = {"cost": 0, "duplicate": 0, "delay": 0, "payment": 0}
    thresholds = {"cost": 50, "duplicate": 75, "delay": 60, "payment": 50}

    for project in rows:
        by_status[project.get("status") or "Unknown"] += 1
        by_category[project.get("category") or "Uncategorised"] += 1
        by_sector[project.get("sector") or "Other"] += 1
        by_risk[project.get("riskLabel") or "Routine"] += 1

        district = project.get("district")
        if district:
            entry = district_budget[district]
            entry["count"] += 1
            entry["budget"] += project.get("budget") or 0
            entry["spent"] += project.get("totalPaid") or 0
            if project.get("riskLabel") not in UNFLAGGED:
                entry["flagged"] += 1

        scores = project.get("scores") or {}
        for key, threshold in thresholds.items():
            if scores.get(key, 0) >= threshold:
                signal_totals[key] += 1

    districts = sorted(
        (
            {
                "name": name,
                "count": values["count"],
                "budget": values["budget"],
                "spent": values["spent"],
                "flagged": values["flagged"],
                "utilisation": round(values["spent"] / values["budget"], 4)
                if values["budget"]
                else 0,
            }
            for name, values in district_budget.items()
        ),
        key=lambda d: d["budget"],
        reverse=True,
    )

    return {
        "byStatus": [
            {"name": name, "value": count} for name, count in by_status.most_common()
        ],
        "byCategory": [
            {"name": name, "value": count} for name, count in by_category.most_common(top)
        ],
        "byRisk": [
            {"name": label, "value": by_risk.get(label, 0)} for label in RISK_ORDER
        ],
        "bySector": [
            {"name": name, "value": count} for name, count in by_sector.most_common(top)
        ],
        "byDistrict": districts[:top],
        # Same wording as the check names on the project screen, so a reader
        # does not have to work out that two different phrases mean the same
        # check. The single source for these is CHECK_NAMES in
        # scripts/prepare_data.py.
        "bySignal": [
            {"name": "Cost compared with similar works", "key": "cost", "value": signal_totals["cost"]},
            {"name": "Looks like another work", "key": "duplicate", "value": signal_totals["duplicate"]},
            {"name": "Time taken", "key": "delay", "value": signal_totals["delay"]},
            {"name": "Money paid against progress", "key": "payment", "value": signal_totals["payment"]},
        ],
    }


@router.get("/review-queue")
def review_queue(
    user: dict = Depends(require_roles("mp", "analyst")),
    limit: int = Query(10, ge=1, le=100),
    dataset: str | None = None,
) -> dict:
    """Highest review priority first — the investigation queue from section 5.8."""
    _, index, rows = visible_rows(user, dataset)
    rows = [p for p in rows if p.get("riskLabel") not in UNFLAGGED]
    rows = store.ProjectIndex.sort(rows, "risk")[:limit]

    return {
        "items": [
            {
                "id": p["id"],
                "anonId": p["anonId"],
                "name": p["name"],
                "district": p["district"],
                "mp": p["mp"],
                "budget": p["budget"],
                "totalPaid": p["totalPaid"],
                "status": p["status"],
                "riskScore": p["riskScore"],
                "riskLabel": p["riskLabel"],
                "primaryReason": p["primaryReason"],
                "activeSignals": p["activeSignals"],
                "reasons": [
                    {"label": s["label"], "score": s["score"], "explanation": s["explanation"]}
                    for s in (p.get("signals") or [])
                    if s.get("active") and s.get("explanation")
                ],
                "anomaly": p.get("anomaly"),
                "checks": [c["title"] for c in p.get("checks") or []],
            }
            for p in rows
        ]
    }


def _scope_label(user: dict) -> str:
    """Where the numbers on screen come from — shown under the KPI strip."""
    if user["role"] == "mp":
        return user.get("constituency") or user.get("name") or "Constituency"
    if user["role"] == "analyst":
        return "All works in the dataset"
    if user["role"] in ("vendor", "officer", "agency"):
        return (
            user.get("constituency")
            or (user.get("districtKey") or "").title()
            or "Your works"
        )
    return "No scope"
