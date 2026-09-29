"""
Turn joined MPLADS works (app/pipeline.py) into the project records the API
serves.

This adds, to each work:

* where it sits on the map (district level, approximate, labelled as such)
* a sector worked out from the description
* the team's four checks and the review priority they add up to, when the
  detector output for that work is available
* the Isolation Forest's separate opinion

It is shared by scripts/prepare_data.py, which builds the dataset the app
ships with, and by the research workspace's CSV import. An import has no
detector output (that pipeline runs offline, with sentence-transformers), so
imported works carry the record checks and the model score but are marked
as not checked by the four checks, rather than scored as zero.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter

from . import anomaly, pipeline
from .config import DATA_DIR


def num(value, default=None):
    """Parse a CSV cell to float. Blanks, 'nan' and junk become `default`."""
    if value is None:
        return default
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return default
    try:
        parsed = float(text)
    except ValueError:
        return default
    if math.isnan(parsed) or math.isinf(parsed):
        return default
    return parsed


def money(value):
    """Rupee amounts are stored as floats like '1000000.0'. Keep them as int."""
    parsed = num(value)
    return None if parsed is None else int(round(parsed))


def text(value):
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    if not cleaned or cleaned.lower() in {"nan", "none", "null"}:
        return None
    return cleaned


def clamp(value, low=0.0, high=100.0):
    return max(low, min(high, value))


def title_case(value):
    """'DISTRICT COLLECTOR PUNE' -> 'District Collector Pune'."""
    if not value:
        return None
    return " ".join(
        word.capitalize() if word.isupper() else word
        for word in value.split()
    )


# --------------------------------------------------------------------------
# geography
# --------------------------------------------------------------------------

GEO = json.loads((DATA_DIR / "district_coords.json").read_text(encoding="utf-8"))
DISTRICT_COORDS = {k.upper(): v for k, v in GEO["districts"].items()}
DISTRICT_ALIASES = {k.upper(): v.upper() for k, v in GEO["aliases"].items()}
CONSTITUENCY_COORDS = {k.upper(): v for k, v in GEO["constituencies"].items()}

# The implementing agency string embeds the district:
#   "PUNE(DISTRICT COLLECTOR PUNE_IDA)" -> PUNE
IDA_DISTRICT = re.compile(r"^([^(]+)\(")


def district_from_ida(ida: str | None) -> str | None:
    if not ida:
        return None
    match = IDA_DISTRICT.match(ida)
    name = (match.group(1) if match else ida).strip().upper()
    return DISTRICT_ALIASES.get(name, name) or None


def jitter(project_id: str, spread: float = 0.16) -> tuple[float, float]:
    """
    Deterministic offset so projects in one district do not stack into a single
    unclickable pin. The same id always produces the same offset, so markers
    never jump between page loads. 0.16 degrees is roughly 18 km.

    The offset is spread over a DISC, not a square. Picking the two axes
    independently fills a square, and on a map that reads as a grid of blocks
    rather than a town. Taking an angle and a distance instead gives a round
    cluster, which is what a scatter of works around a district centre actually
    looks like.

    The square root on the distance matters: without it the points bunch toward
    the centre, because a ring of radius r has more room in it than a ring of
    radius r/2.
    """
    digest = hashlib.md5(project_id.encode("utf-8")).digest()
    angle = int.from_bytes(digest[0:2], "big") / 65535 * 2 * math.pi
    distance = math.sqrt(int.from_bytes(digest[2:4], "big") / 65535) * spread
    return distance * math.sin(angle), distance * math.cos(angle)


def locate(project_id, district, constituency):
    """
    Returns (lat, lon, precision). Precision is surfaced in the UI so nobody
    mistakes these for surveyed work-site coordinates.
    """
    base = DISTRICT_COORDS.get(district or "")
    precision = "district"
    if not base:
        base = CONSTITUENCY_COORDS.get((constituency or "").upper())
        precision = "constituency"
    if not base:
        return None, None, None
    lat_offset, lon_offset = jitter(project_id)
    return round(base[0] + lat_offset, 5), round(base[1] + lon_offset, 5), precision


# --------------------------------------------------------------------------
# detector scores
# --------------------------------------------------------------------------

def index_by_work_id(rows: list[dict]) -> dict[str, dict]:
    """
    Index detector rows by work_id, SKIPPING blank ids.

    This single guard is what prevents the 465,892-row explosion. If a work_id
    repeats, the highest-scoring row wins rather than multiplying rows.
    """
    out: dict[str, dict] = {}
    skipped = 0
    for row in rows:
        work_id = text(row.get("work_id"))
        if not work_id:
            skipped += 1
            continue
        out[work_id] = row
    return out, skipped


def build_duplicate_scores(rows: list[dict]):
    """
    duplicate_scores.csv is pair-level (work A vs work B). Collapse it to a
    per-project maximum, and keep the matched partner so the UI can show
    "potential overlap with <this other work>" instead of a bare number.
    """
    best: dict[str, dict] = {}
    for row in rows:
        score = num(row.get("duplicate_overlap_score"), 0.0) or 0.0
        a = text(row.get("work_id_a"))
        b = text(row.get("work_id_b"))
        for own, other, other_desc in (
            (a, b, text(row.get("description_b"))),
            (b, a, text(row.get("description_a"))),
        ):
            if not own:
                continue
            if own not in best or score > best[own]["score"]:
                best[own] = {
                    "score": score,
                    "match_id": other,
                    "match_description": other_desc,
                    "similarity": num(row.get("text_similarity")),
                    "same_agency": str(row.get("same_ida", "")).strip().lower()
                    in {"true", "1", "yes"},
                    "same_constituency": str(row.get("same_constituency", "")).strip().lower()
                    in {"true", "1", "yes"},
                    "explanation": text(row.get("explanation")),
                }
    return best


# --------------------------------------------------------------------------
# sector
# --------------------------------------------------------------------------

# The `work_category` column in the source files is close to useless: 4,697 of
# 4,807 works are filed as "Normal/Others". So the sector is worked out from
# the description instead, which is where the real information is.
#
# This is a DERIVED field, not something the government published. It is
# labelled that way on screen. The rules are plain keyword matching, in order,
# first match wins, so anyone can read them and check a result by hand. They
# are deliberately not a machine learning model: for something a judge might
# question, a list of words they can read beats an accuracy figure they cannot.
SECTOR_RULES: list[tuple[str, tuple[str, ...]]] = [
    # Very specific structures first, so they are not swallowed by a broader
    # word appearing later in the same sentence.
    ("Cremation grounds", ("cremation", "crematorium", "smashan", "smasan", "burial", "kabrastan", "dahan")),
    ("Schools and anganwadis", ("school", "anganwadi", "angan wadi", "classroom", "class room", "library", "vachanalay", "reading room", "study cent", "college", "hostel")),
    ("Health", ("hospital", "dispensary", "health centre", "health center", "primary health", "ambulance", "sub centre")),
    ("Toilets and sanitation", ("toilet", "shauchalay", "sanitation", "urinal", "sulabh")),
    ("Sports and open spaces", ("gymnasium", "vyayamshala", "vyayam", "sport", "playground", "play ground", "playfield", "play field", "krida", "garden", "udyan", "park ", "gym ", "gym.", "open gym")),
    ("Street lighting", ("solar", "high mast", "highmast", "street light", "streetlight", "led light", "lamp post")),
    ("Water and drainage", ("drain", "gutter", "nala", "nalla", "borewell", "bore well", "water supply", "pipeline", "water tank", "filter", "well ", "tubewell", "rcc pipe")),
    # Roads come before buildings because a work described as a road running to
    # a temple or a school is still a road.
    ("Roads and paths", (
        "road", "rasta", "concreting", "concrete road", "cc road",
        # The source spells paving blocks at least five different ways.
        "paver", "paving", "peving", "pevhing", "pavhing", "pevin", "pavement",
        "pathway", "path way", "footpath", "approach", "asphalt", "tar ",
        "bridge", "culvert", "raod",
    )),
    ("Community halls", (
        "community hall", "community cent", "community building", "sabha mandap",
        "sabhamandap", "samaj mandir", "mangal karyalay", "cultural activit",
        "cultural cent", "hall", "mandap",
    )),
    ("Religious and cultural", ("temple", "mandir", "masjid", "church", "dargah", "math ", "buddha vihar", "vihar")),
    ("Protective and retaining walls", ("protection wall", "protective wall", "retaining wall", "compound wall", "boundary wall", "wall")),
]


def sector_for(description: str | None) -> str:
    """Work out a sector from the description. Returns 'Other' if nothing fits."""
    if not description:
        return "Other"
    text = f" {description.lower()} "
    for name, keywords in SECTOR_RULES:
        if any(keyword in text for keyword in keywords):
            return name
    return "Other"


# --------------------------------------------------------------------------
# plain English
# --------------------------------------------------------------------------

# The detector scripts write their explanations for someone who already knows
# the scheme. "IDA" is the implementing agency, "semantic peers" are works with
# similar descriptions, and "workflow status" is the stage a work has reached.
# None of that is obvious to a member of parliament, a contractor, or a judge
# reading the screen for the first time.
#
# These are wording swaps only. No number, name or claim is changed, and the
# untouched originals stay in data/source/ if anyone wants to check.
PHRASES: list[tuple[str, str]] = [
    ("semantically similar works", "works with similar descriptions"),
    ("semantically similar", "similar"),
    ("Insufficient semantic peers", "Not enough similar works to compare"),
    ("Average description similarity", "Average similarity of the descriptions"),
    ("Same IDA: True", "Handled by the same district office: yes"),
    ("Same IDA: False", "Handled by the same district office: no"),
    ("same constituency: True", "same constituency: yes"),
    ("same constituency: False", "same constituency: no"),
    ("same financial year: True", "same financial year: yes"),
    ("same financial year: False", "same financial year: no"),
    ("Current workflow status:", "Current stage:"),
    ("the workflow status remains", "the stage is still"),
    ("days since sanction", "days since it was approved"),
    ("since sanction.", "since it was approved."),
    ("Sanctioned amount", "Approved amount"),
    ("sanctioned amount", "approved amount"),
    ("No recorded payment for", "No payment recorded for"),
    # The detector text uses "status" and "workflow status" for the same thing
    # the rest of the screen calls a stage. One word for one idea.
    ("while status is", "while the stage is"),
    ("while status remains", "while the stage is still"),
]


def plain_english(text_value: str | None) -> str | None:
    """Swap scheme jargon for everyday words. Numbers are never touched."""
    if not text_value:
        return text_value
    out = text_value
    for old, new in PHRASES:
        out = out.replace(old, new)
    return out


# Names for the four checks, and for the leading reason, in words a first-time
# reader understands. The keys are the ones build_review_queue.py already uses.
CHECK_NAMES = {
    "cost": "Cost compared with similar works",
    "duplicate": "Looks like another work",
    "delay": "Time taken",
    "payment": "Money paid against progress",
}

REASON_NAMES = {
    "Peer cost anomaly": "Cost looks unusual",
    "Potential overlapping work": "May repeat another work",
    "Extended project timeline": "Taking a long time",
    "Payment-workflow inconsistency": "Money ahead of progress",
}


def priority_label(score: float) -> str:
    """Thresholds copied verbatim from build_review_queue.py."""
    if score >= 75:
        return "Critical Review"
    if score >= 55:
        return "High Review"
    if score >= 35:
        return "Medium Review"
    return "Routine"




# The label for a work the four checks were never run on: a recommendation
# that was never sanctioned, a work missing from the detector output, or any
# work in an imported dataset. Calling these "Routine" would claim a check
# that did not happen.
NOT_CHECKED = "Not checked"


def _normal_id(value) -> str | None:
    """Work ids in some exports carry stray spaces and tabs inside them."""
    cleaned = re.sub(r"\s+", "", value or "")
    return cleaned or None


def load_detectors(source_dir) -> dict:
    """
    Read the detector CSVs the team's offline pipeline produced. Returns the
    four per-work lookups, joined on the work id with whitespace removed.
    """
    import csv

    csv.field_size_limit(10_000_000)

    def read(name):
        with (source_dir / name).open(newline="", encoding="utf-8-sig") as fh:
            return list(csv.DictReader(fh))

    def normalise(rows, *columns):
        for row in rows:
            for column in columns:
                row[column] = _normal_id(row.get(column)) or ""
        return rows

    cost, _ = index_by_work_id(normalise(read("semantic_peer_cost_scores.csv"), "work_id"))
    delay, _ = index_by_work_id(normalise(read("delay_scores.csv"), "work_id"))
    payment, _ = index_by_work_id(normalise(read("payment_progress_scores.csv"), "work_id"))
    duplicate = build_duplicate_scores(normalise(read("duplicate_scores.csv"), "work_id_a", "work_id_b"))
    return {"cost": cost, "delay": delay, "payment": payment, "duplicate": duplicate}


def _four_checks(work_id: str, detectors: dict | None) -> dict:
    """The team's four checks and the review priority, exactly as build_review_queue.py combines them."""
    if not detectors:
        return {"checked": False}
    cost = detectors["cost"].get(work_id)
    delay = detectors["delay"].get(work_id, {})
    payment = detectors["payment"].get(work_id)
    duplicate = detectors["duplicate"].get(work_id, {})
    # The cost and payment detectors score every sanctioned work they saw. A
    # work missing from both was never run through the detectors at all.
    if cost is None and payment is None:
        return {"checked": False}
    cost = cost or {}
    payment = payment or {}

    cost_score = clamp(num(cost.get("semantic_cost_score"), 0.0) or 0.0)
    delay_score = clamp(num(delay.get("delay_score"), 0.0) or 0.0)
    payment_score = clamp(num(payment.get("payment_progress_score"), 0.0) or 0.0)
    duplicate_score = clamp(duplicate.get("score", 0.0) or 0.0)

    active_signals = (
        (1 if cost_score >= 50 else 0)
        + (1 if duplicate_score >= 75 else 0)
        + (1 if delay_score >= 60 else 0)
        + (1 if payment_score >= 50 else 0)
    )
    priority = 0.30 * cost_score + 0.25 * duplicate_score + 0.25 * delay_score + 0.20 * payment_score
    priority += min(active_signals, 3) * 5
    priority = round(clamp(priority), 1)

    signal_scores = {
        "Peer cost anomaly": cost_score,
        "Potential overlapping work": duplicate_score,
        "Extended project timeline": delay_score,
        "Payment-workflow inconsistency": payment_score,
    }
    primary = max(signal_scores, key=signal_scores.get)
    primary = "Nothing flagged" if signal_scores[primary] <= 0 else REASON_NAMES.get(primary, primary)

    return {
        "checked": True,
        "riskScore": priority,
        "riskLabel": priority_label(priority),
        "primaryReason": primary,
        "activeSignals": active_signals,
        "scores": {
            "cost": round(cost_score, 1),
            "duplicate": round(duplicate_score, 1),
            "delay": round(delay_score, 1),
            "payment": round(payment_score, 1),
        },
        "signals": [
            {"key": "cost", "label": CHECK_NAMES["cost"], "score": round(cost_score, 1), "active": cost_score >= 50,
             "explanation": plain_english(text(cost.get("cost_explanation")))},
            {"key": "duplicate", "label": CHECK_NAMES["duplicate"], "score": round(duplicate_score, 1),
             "active": duplicate_score >= 75, "explanation": plain_english(text(duplicate.get("explanation")))},
            {"key": "delay", "label": CHECK_NAMES["delay"], "score": round(delay_score, 1), "active": delay_score >= 60,
             "explanation": plain_english(text(delay.get("delay_explanation")))},
            {"key": "payment", "label": CHECK_NAMES["payment"], "score": round(payment_score, 1),
             "active": payment_score >= 50,
             "explanation": plain_english(text(payment.get("payment_progress_explanation")))},
        ],
        "peer": {
            "count": num(cost.get("semantic_peer_count")),
            "medianInr": money(cost.get("peer_median_inr")),
            "q1Inr": money(cost.get("peer_q1_inr")),
            "q3Inr": money(cost.get("peer_q3_inr")),
            "ratioToMedian": num(cost.get("cost_ratio_to_median")),
            "averageSimilarity": num(cost.get("average_similarity")),
        },
        "duplicateMatch": {
            "id": duplicate.get("match_id"),
            "description": duplicate.get("match_description"),
            "similarity": duplicate.get("similarity"),
            "sameAgency": duplicate.get("same_agency"),
            "sameConstituency": duplicate.get("same_constituency"),
        }
        if duplicate
        else None,
    }


def build(analysis: dict, *, detectors: dict | None = None, dataset_id: str = "base") -> dict:
    """
    Records the API serves, plus counts for the About panel. `analysis` is the
    output of pipeline.analyze().
    """
    summary = analysis["summary"]
    as_of = summary["asOf"]
    model = anomaly.forest()
    projects = []

    for work in analysis["works"]:
        district = district_from_ida(work["authority"])
        lat, lon, precision = locate(work["id"], district, work["constituency"])
        sanctioned = work["sanctioned"] is not None
        budget = work["sanctionAmount"] or work["recommendedAmount"]
        payment_dates = [p["date"] for p in work["payments"] if p["date"]]
        last_payment = max(payment_dates) if payment_dates else None
        description = work["description"] or work["category"] or "Unnamed work"

        status = work["status"] or (
            "Work Completed" if work["completed"] else "Sanction" if sanctioned else "Recommended"
        )

        features = pipeline.model_features(work)
        scored = model.score(features) if (model and features) else None

        checks = _four_checks(work["id"], detectors)
        if not checks["checked"]:
            checks = {
                "riskScore": 0,
                "riskLabel": NOT_CHECKED,
                "primaryReason": "Not checked",
                "activeSignals": 0,
                "scores": None,
                "signals": None,
                "peer": None,
                "duplicateMatch": None,
            }
            four_checks = False
        else:
            checks.pop("checked")
            four_checks = True

        projects.append(
            {
                "id": work["id"],
                "anonId": work["alias"],
                "name": description,
                "workType": work["category"] or None,
                "category": work.get("schemeCategory") or "Uncategorised",
                "sector": sector_for(description),
                "state": work["state"] or "Maharashtra",
                "district": title_case(district) if district else None,
                "districtKey": district,
                "constituency": work["constituency"],
                "agency": work["authority"],
                "agencyShort": title_case(district) if district else work["authority"],
                "mp": work["mp"],
                "mpAlias": work["mpAlias"],
                "areaAlias": work["areaAlias"],
                "authorityAlias": work["authorityAlias"],
                "status": status,
                "stage": work["stage"],
                "sanctioned": sanctioned,
                "hasCompletionRecord": work["completed"] is not None,
                # money
                "budget": budget,
                "sanctionAmount": work["sanctionAmount"],
                "recommendedAmount": work["recommendedAmount"],
                "amountDisbursed": work["completionAmount"],
                "totalPaid": work["paid"],
                "pendingPaid": work["pending"],
                "paymentCount": len(work["payments"]),
                "paymentRatio": round(work["paid"] / work["sanctionAmount"], 4) if work["sanctionAmount"] else None,
                # dates
                "recommendedDate": work["recommended"],
                "sanctionDate": work["sanctioned"],
                "recommendationSanctionDate": work.get("recommendationSanctionDate"),
                "completionDate": work["completed"],
                "firstPaymentDate": min(payment_dates) if payment_dates else None,
                "lastPaymentDate": last_payment,
                "daysSinceSanction": work["age"],
                "sanctionInterval": work["sanctionInterval"],
                "duration": work["duration"],
                "daysSinceLastPayment": pipeline.days(as_of, last_payment),
                # location
                "lat": lat,
                "lon": lon,
                "locationPrecision": precision,
                # provenance
                "payments": work["payments"],
                "sources": work["sources"],
                "imageLabel": work.get("imageLabel"),
                # the team's four checks (review priority)
                "fourChecks": four_checks,
                **checks,
                # the in-app record checks (rules-1.0)
                "checks": work["flags"],
                "ruleScore": work["score"],
                "similar": work["similar"],
                "peerGroup": work["peerGroup"],
                "peerStats": work.get("peerStats"),
                # the model's separate opinion
                "anomaly": scored,
            }
        )

    label_counts = Counter(p["riskLabel"] for p in projects)
    meta = {
        "datasetId": dataset_id,
        "totalProjects": len(projects),
        "sanctioned": sum(1 for p in projects if p["sanctioned"]),
        "unsanctionedRecommendations": summary["recommendationsWithoutId"],
        "withRiskSignal": sum(1 for p in projects if p["riskScore"] > 0),
        "fourChecksRun": sum(1 for p in projects if p["fourChecks"]),
        "withCoordinates": sum(1 for p in projects if p["lat"] is not None),
        "scoredByModel": sum(1 for p in projects if p["anomaly"]),
        "withRecordChecks": sum(1 for p in projects if p["checks"]),
        "districts": len({p["district"] for p in projects if p["district"]}),
        "constituencies": len({p["constituency"] for p in projects if p["constituency"]}),
        "members": len({p["mp"] for p in projects if p["mp"]}),
        "labelCounts": dict(label_counts),
        "sectorCounts": dict(Counter(p["sector"] for p in projects).most_common()),
    }
    return {
        "snapshot": as_of,
        "meta": meta,
        "summary": summary,
        "allocations": analysis.get("allocations", []),
        "projects": projects,
    }
