"""
Rules for work delivered through the system: registered projects, contractor
expense claims and deadlines.

Everything here produces review signals, written as sentences. None of it
blocks a submission: an over-budget claim is saved and shown, because
recording it is the point.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from statistics import median

from . import enrich, store

STAGES = ("Planning", "Foundation", "Construction", "Finishing", "Completed")

# A new claim's rate is compared with earlier claims for the same material and
# unit only when at least this many exist, so one odd entry cannot set the bar.
RATE_MIN_PRIOR = 3
RATE_FACTOR = 1.3


def registered_as_project(row: dict) -> dict:
    """
    A registered project, shaped like an MPLADS record so lists, the map, the
    timeline and the detail view all handle it without special cases.

    It carries no four-check or model result. Those were built for the report
    snapshot; scoring a work that started last week against works that have
    run for two years would be comparing unlike things.
    """
    district_key = (row.get("district") or "").upper() or None
    lat, lon, precision = enrich.locate(row["id"], district_key, None)
    today = date.today().isoformat()
    return {
        "id": row["id"],
        "anonId": f"REG-{row['id'][:8].upper()}",
        "source": "registered",
        "name": row["title"],
        "description": row["description"],
        "workType": row["sector"],
        "category": "Registered in Smart Nigrani",
        "sector": row["sector"],
        "state": "Maharashtra",
        "district": enrich.title_case(district_key) if district_key else None,
        "districtKey": district_key,
        "constituency": None,
        "agency": None,
        "mp": row["mp_name"],
        "mpAlias": None,
        "status": "Registered",
        "stage": "Registered",
        "sanctioned": True,
        "hasCompletionRecord": False,
        "budget": row["budget"],
        "sanctionAmount": row["budget"],
        "recommendedAmount": None,
        "amountDisbursed": None,
        "totalPaid": 0,
        "pendingPaid": 0,
        "paymentCount": 0,
        "paymentRatio": None,
        "recommendedDate": None,
        "sanctionDate": row["sanctioned"],
        "completionDate": None,
        "deadline": row["deadline"],
        "daysSinceSanction": (date.fromisoformat(today) - date.fromisoformat(row["sanctioned"])).days,
        "lat": lat,
        "lon": lon,
        "locationPrecision": precision,
        "payments": [],
        "sources": [],
        "contractor": row["contractor"],
        "officer": row["officer"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "fourChecks": False,
        "riskScore": 0,
        "riskLabel": enrich.NOT_CHECKED,
        "primaryReason": "Not checked",
        "activeSignals": 0,
        "scores": None,
        "signals": None,
        "peer": None,
        "duplicateMatch": None,
        "checks": [],
        "ruleScore": 0,
        "similar": [],
        "peerStats": None,
        "anomaly": None,
    }


def registered_for(user: dict) -> list[dict]:
    """Registered projects this user may see: the whole team's, or only those assigned to them."""
    if user.get("role") not in store.TEAM_ROLES or not user.get("mpName"):
        return []
    rows = store.registered_rows(user["mpName"])
    if user["role"] == "vendor":
        rows = [r for r in rows if r["contractor"] == user["username"]]
    elif user["role"] == "officer":
        rows = [r for r in rows if r["officer"] == user["username"]]
    return [registered_as_project(r) for r in rows]


def latest_progress(project_id: str) -> int | None:
    """Most recent progress anyone reported, from work log entries and photographs."""
    reports: list[tuple[str, int]] = []
    for work in store.list_works(project_id):
        if work.get("progress") is not None:
            reports.append((work["createdAt"], work["progress"]))
    for item in store.list_evidence(project_id):
        if item.get("progress") is not None:
            reports.append((item["createdAt"], item["progress"]))
    return max(reports)[1] if reports else None


def overdue_days(project: dict, today: date | None = None) -> int:
    """
    Days past the completion target, for a registered project that has not
    reported 100% progress. Zero otherwise. Progress is what the contractor
    or officer reported, not a verified measurement.
    """
    deadline = project.get("deadline")
    if not deadline:
        return 0
    progress = latest_progress(project["id"]) or 0
    if progress >= 100:
        return 0
    today = today or datetime.now(timezone.utc).date()
    return max(0, (today - date.fromisoformat(deadline)).days)


def expense_flags(
    items: list[dict],
    project: dict,
    previous: list[dict],
    stage: str | None,
    new_total: int,
) -> list[str]:
    """
    Review signals for one expense submission. Plain sentences; the claim is
    saved regardless.

    * Claims so far plus this one exceed the approved budget.
    * The same invoice number and material appear in an earlier claim for this
      work, or twice in this submission.
    * Materials billed while the work is still at the Planning stage.
    * A rate well above earlier claims for the same material and unit across
      the system (only once enough earlier claims exist to compare with).
    """
    flags: list[str] = []
    budget = project.get("budget") or 0
    claimed = sum(w["cost"] for w in previous) + new_total
    if budget and claimed > budget:
        flags.append(
            f"Entries recorded so far total ₹{claimed:,}, above the ₹{budget:,} approved amount. "
            "These are claims entered by the contractor, not verified payments."
        )

    earlier = {
        (i["invoice"].strip().lower(), i["material"].strip().lower())
        for w in previous
        for i in (w.get("items") or [])
    }
    seen_now: set[tuple[str, str]] = set()
    for number, item in enumerate(items, start=1):
        key = (item["invoice"].strip().lower(), item["material"].strip().lower())
        if key in earlier:
            flags.append(
                f"Item {number}: invoice {item['invoice']} for {item['material']} matches an earlier claim on "
                "this work. Check for duplicate billing, or confirm it is a separate instalment."
            )
        elif key in seen_now:
            flags.append(
                f"Item {number}: invoice {item['invoice']} for {item['material']} appears twice in this submission."
            )
        seen_now.add(key)

        if stage == "Planning":
            flags.append(
                f"Item {number}: material billed while the work is at the Planning stage. Check authorisation "
                "and delivery timing."
            )

        rates = store.prior_rates(item["material"], item["unit"])
        if len(rates) >= RATE_MIN_PRIOR:
            typical = median(rates)
            if item["rate"] > typical * RATE_FACTOR:
                flags.append(
                    f"Item {number}: {item['material']} at ₹{item['rate']:,}/{item['unit']} is "
                    f"{round((item['rate'] / typical - 1) * 100)}% above the median of {len(rates)} earlier "
                    f"claims for the same material and unit in this system (₹{typical:,.2f}). Check grade, "
                    "tax and transport. This compares with other entries, not with an official rate."
                )
    # Several items can raise the same sentence; say it once.
    return list(dict.fromkeys(flags))
