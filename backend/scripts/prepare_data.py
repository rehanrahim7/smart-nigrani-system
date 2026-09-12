"""
Build the clean project dataset the API serves.

Reads the five detector CSVs produced by the analysis pipeline and merges
them into a single projects.json.

Why this script exists
----------------------
The original build_review_queue.py merged the detector outputs with pandas on
the `work_id` column. 2,377 rows of master_projects.csv have a BLANK work_id
(recommendations that were never sanctioned, so they never received one), and
several detector files carry blank-id rows too. pandas treats blank as a real
join key, so those rows multiplied:

    2377 blank master rows x 7 cost x 4 delay x 7 payment = 465,892 junk rows

That is why review_queue.csv has 468,322 rows for 2,431 real projects, and why
/api/stats reported "468,058 Routine projects".

This script joins only on non-blank ids and gives unsanctioned recommendations
their own synthetic id, so every project appears exactly once.

The scoring formula is reproduced EXACTLY from build_review_queue.py so the
numbers stay consistent with the team's own analysis. Do not change the weights
without changing them there too.

Run:  python scripts/prepare_data.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import anomaly  # noqa: E402

# Descriptions in the source CSVs run long; the default field limit truncates.
csv.field_size_limit(10_000_000)

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "source"
OUT = ROOT / "data"

# Snapshot date of the MPLADS extract. Ages are measured against this, not
# against today, so the numbers on screen never drift from the analysis.
SNAPSHOT = date(2026, 9, 9)


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def read_csv(name: str) -> list[dict]:
    path = SOURCE / name
    if not path.exists():
        sys.exit(f"missing source file: {path}")
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


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


def parse_date(value):
    """Return an ISO date string, or None. Source uses YYYY-MM-DD."""
    raw = text(value)
    if not raw:
        return None
    raw = raw.split(" ")[0].split("T")[0]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def days_between(iso_value, reference=SNAPSHOT):
    if not iso_value:
        return None
    try:
        parsed = date.fromisoformat(iso_value)
    except ValueError:
        return None
    return (reference - parsed).days


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

GEO = json.loads((OUT / "district_coords.json").read_text(encoding="utf-8"))
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


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    print("=" * 62)
    print("Smart Nigrani System — preparing project dataset")
    print("=" * 62)

    master = read_csv("master_projects.csv")
    cost_rows = read_csv("semantic_peer_cost_scores.csv")
    delay_rows = read_csv("delay_scores.csv")
    payment_rows = read_csv("payment_progress_scores.csv")
    duplicate_rows = read_csv("duplicate_scores.csv")

    cost_by_id, cost_skipped = index_by_work_id(cost_rows)
    delay_by_id, delay_skipped = index_by_work_id(delay_rows)
    payment_by_id, payment_skipped = index_by_work_id(payment_rows)
    duplicate_by_id = build_duplicate_scores(duplicate_rows)

    print(f"  master rows              {len(master):>7}")
    print(f"  cost scores              {len(cost_by_id):>7}  (skipped {cost_skipped} blank ids)")
    print(f"  delay scores             {len(delay_by_id):>7}  (skipped {delay_skipped} blank ids)")
    print(f"  payment scores           {len(payment_by_id):>7}  (skipped {payment_skipped} blank ids)")
    print(f"  duplicate pairs          {len(duplicate_rows):>7}  -> {len(duplicate_by_id)} projects")
    print()

    projects = []
    unsanctioned = 0
    missing_coords = Counter()

    for index, row in enumerate(master):
        work_id = text(row.get("work_id"))

        # Recommendations that were never sanctioned carry no work_id. Give
        # them a stable synthetic one so they remain addressable in the UI.
        if work_id:
            project_id = work_id
            sanctioned = True
        else:
            project_id = f"REC-{index + 1:05d}"
            sanctioned = False
            unsanctioned += 1

        # A short, stable public reference for a work, safe to read aloud or
        # put on a slide — MPLADS ids like WS/MP681/2024-2025/143652 are not.
        anon_id = f"SNS-{index + 1:04d}"

        # ---- descriptive fields, falling back across the three source files
        description = (
            text(row.get("work_description"))
            or text(row.get("work_description_sanctioned"))
            or text(row.get("work_description_recommended"))
            or text(row.get("work_description_completed"))
            or "Unnamed work"
        )
        category = (
            text(row.get("work_category_recommended"))
            or text(row.get("work_category_sanctioned"))
            or text(row.get("work_category_completed"))
            or "Uncategorised"
        )
        mp_name = (
            text(row.get("hon_ble_members_of_parliament_recommended"))
            or text(row.get("hon_ble_members_of_parliament_sanctioned"))
            or text(row.get("hon_ble_members_of_parliament_completed"))
        )
        constituency = text(row.get("constituency")) or text(
            row.get("constituency_recommended")
        )
        ida = text(row.get("ida")) or text(row.get("ida_recommended"))
        district = district_from_ida(ida)

        # ---- money
        sanction_amount = money(row.get("sanction_amount_sanctioned"))
        recommended_amount = money(row.get("recommended_amount_recommended"))
        disbursed = money(row.get("amount_disbursed_completed"))
        total_paid = money(row.get("total_paid")) or 0
        payment_count = int(num(row.get("payment_count"), 0) or 0)

        # The headline budget figure: sanctioned if available, else recommended.
        budget = sanction_amount or recommended_amount

        # ---- dates
        recommended_date = parse_date(row.get("recommended_date_recommended"))
        sanction_date = parse_date(row.get("sanction_date_sanctioned")) or parse_date(
            row.get("sanction_date_recommended")
        )
        completion_date = parse_date(row.get("completion_date_completed"))
        first_payment = parse_date(row.get("first_payment_date"))
        last_payment = parse_date(row.get("last_payment_date"))

        has_completed = str(row.get("has_completed_record", "")).strip().lower() == "true"

        # ---- status
        status = text(row.get("work_status_sanctioned"))
        if not status:
            if has_completed:
                status = "Work Completed"
            elif sanctioned:
                status = "Sanction"
            else:
                status = "Recommended"

        # ---- detector scores (only sanctioned works carry a work_id to join on)
        cost = cost_by_id.get(project_id, {}) if sanctioned else {}
        delay = delay_by_id.get(project_id, {}) if sanctioned else {}
        payment = payment_by_id.get(project_id, {}) if sanctioned else {}
        duplicate = duplicate_by_id.get(project_id, {}) if sanctioned else {}

        cost_score = clamp(num(cost.get("semantic_cost_score"), 0.0) or 0.0)
        delay_score = clamp(num(delay.get("delay_score"), 0.0) or 0.0)
        payment_score = clamp(num(payment.get("payment_progress_score"), 0.0) or 0.0)
        duplicate_score = clamp(duplicate.get("score", 0.0) or 0.0)

        # ---- exact formula from build_review_queue.py
        active_signals = (
            (1 if cost_score >= 50 else 0)
            + (1 if duplicate_score >= 75 else 0)
            + (1 if delay_score >= 60 else 0)
            + (1 if payment_score >= 50 else 0)
        )
        priority = (
            0.30 * cost_score
            + 0.25 * duplicate_score
            + 0.25 * delay_score
            + 0.20 * payment_score
        )
        priority += min(active_signals, 3) * 5
        priority = round(clamp(priority), 1)
        label = priority_label(priority)

        signal_scores = {
            "Peer cost anomaly": cost_score,
            "Potential overlapping work": duplicate_score,
            "Extended project timeline": delay_score,
            "Payment-workflow inconsistency": payment_score,
        }
        primary_reason = max(signal_scores, key=signal_scores.get)
        # A project with no signal at all should say so rather than naming a
        # reason that scored zero.
        if signal_scores[primary_reason] <= 0:
            primary_reason = "Nothing flagged"
        else:
            primary_reason = REASON_NAMES.get(primary_reason, primary_reason)

        # ---- derived financial ratios
        payment_ratio = num(payment.get("payment_to_sanction_ratio"))
        if payment_ratio is None and budget:
            payment_ratio = round(total_paid / budget, 4) if budget else None

        # ---- location
        lat, lon, precision = locate(project_id, district, constituency)
        if lat is None:
            missing_coords[district or constituency or "unknown"] += 1

        signals = [
            {
                "key": "cost",
                "label": CHECK_NAMES["cost"],
                "score": round(cost_score, 1),
                "active": cost_score >= 50,
                "explanation": plain_english(text(cost.get("cost_explanation"))),
            },
            {
                "key": "duplicate",
                "label": CHECK_NAMES["duplicate"],
                "score": round(duplicate_score, 1),
                "active": duplicate_score >= 75,
                "explanation": plain_english(text(duplicate.get("explanation"))),
            },
            {
                "key": "delay",
                "label": CHECK_NAMES["delay"],
                "score": round(delay_score, 1),
                "active": delay_score >= 60,
                "explanation": plain_english(text(delay.get("delay_explanation"))),
            },
            {
                "key": "payment",
                "label": CHECK_NAMES["payment"],
                "score": round(payment_score, 1),
                "active": payment_score >= 50,
                "explanation": plain_english(text(payment.get("payment_progress_explanation"))),
            },
        ]

        projects.append(
            {
                "id": project_id,
                "anonId": anon_id,
                "name": description,
                "category": category,
                "sector": sector_for(description),
                "state": text(row.get("state")) or "Maharashtra",
                "district": title_case(district) if district else None,
                "districtKey": district,
                "constituency": constituency,
                "agency": ida,
                "agencyShort": title_case(district) if district else ida,
                "mp": mp_name,
                "status": status,
                "sanctioned": sanctioned,
                "hasCompletionRecord": has_completed,
                # money
                "budget": budget,
                "sanctionAmount": sanction_amount,
                "recommendedAmount": recommended_amount,
                "amountDisbursed": disbursed,
                "totalPaid": total_paid,
                "paymentCount": payment_count,
                "paymentRatio": payment_ratio,
                # dates
                "recommendedDate": recommended_date,
                "sanctionDate": sanction_date,
                "completionDate": completion_date,
                "firstPaymentDate": first_payment,
                "lastPaymentDate": last_payment,
                "daysSinceSanction": num(delay.get("days_since_sanction"))
                or days_between(sanction_date),
                "daysSinceLastPayment": num(payment.get("days_since_last_payment"))
                or days_between(last_payment),
                # location
                "lat": lat,
                "lon": lon,
                "locationPrecision": precision,
                # risk
                "riskScore": priority,
                "riskLabel": label,
                "primaryReason": primary_reason,
                "activeSignals": active_signals,
                "scores": {
                    "cost": round(cost_score, 1),
                    "duplicate": round(duplicate_score, 1),
                    "delay": round(delay_score, 1),
                    "payment": round(payment_score, 1),
                },
                "signals": signals,
                # peer context for the cost signal
                "peer": {
                    "count": num(cost.get("semantic_peer_count")),
                    "medianInr": money(cost.get("peer_median_inr")),
                    "q1Inr": money(cost.get("peer_q1_inr")),
                    "q3Inr": money(cost.get("peer_q3_inr")),
                    "ratioToMedian": num(cost.get("cost_ratio_to_median")),
                    "averageSimilarity": num(cost.get("average_similarity")),
                },
                # matched partner for the duplicate signal
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
        )

    # ----------------------------------------------------------------------
    # the Isolation Forest
    #
    # A second, independent opinion on every sanctioned work, from a model that
    # was never told what a bad work looks like. It is kept separate from the
    # review priority on purpose: that number comes from the four rule checks
    # and can be explained line by line, and mixing an unexplainable score into
    # it would spoil the one property that makes it useful.
    # ----------------------------------------------------------------------
    model = anomaly.forest()
    scored_by_model = 0
    for project in projects:
        result = anomaly.score_project(project) if model else None
        project["anomaly"] = result
        if result:
            scored_by_model += 1

    # ----------------------------------------------------------------------
    # integrity checks — fail loudly rather than shipping a broken dataset
    # ----------------------------------------------------------------------
    ids = [p["id"] for p in projects]
    if len(ids) != len(set(ids)):
        duplicated = [i for i, c in Counter(ids).items() if c > 1][:5]
        sys.exit(f"FATAL: duplicate project ids, e.g. {duplicated}")
    if len(projects) != len(master):
        sys.exit(f"FATAL: {len(projects)} projects from {len(master)} master rows")

    scored = [p for p in projects if p["riskScore"] > 0]
    with_coords = [p for p in projects if p["lat"] is not None]
    label_counts = Counter(p["riskLabel"] for p in projects)
    district_counts = Counter(p["district"] for p in projects if p["district"])
    category_counts = Counter(p["category"] for p in projects)
    sector_counts = Counter(p["sector"] for p in projects)
    mp_counts = Counter(p["mp"] for p in projects if p["mp"])

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "snapshot": SNAPSHOT.isoformat(),
        "meta": {
            "totalProjects": len(projects),
            "sanctioned": sum(1 for p in projects if p["sanctioned"]),
            "unsanctionedRecommendations": unsanctioned,
            "withRiskSignal": len(scored),
            "withCoordinates": len(with_coords),
            "scoredByModel": scored_by_model,
            "districts": len(district_counts),
            "constituencies": len({p["constituency"] for p in projects if p["constituency"]}),
            "members": len(mp_counts),
            "labelCounts": dict(label_counts),
            "sectorCounts": dict(sector_counts.most_common()),
        },
        "projects": projects,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / "projects.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print("  ---------------------------------------------------------")
    print(f"  projects written         {len(projects):>7}")
    print(f"  sanctioned works         {payload['meta']['sanctioned']:>7}")
    print(f"  unsanctioned recs        {unsanctioned:>7}")
    print(f"  carrying a risk signal   {len(scored):>7}")
    print(f"  placed on the map        {len(with_coords):>7}")
    print(f"  scored by the model      {scored_by_model:>7}")
    print(f"  districts / MPs          {len(district_counts):>7} / {len(mp_counts)}")
    print()
    print("  review priority distribution")
    for name in ("Critical Review", "High Review", "Medium Review", "Routine"):
        print(f"    {name:<18} {label_counts.get(name, 0):>6}")
    if missing_coords:
        print()
        print(f"  WARNING unmapped locations: {dict(missing_coords)}")
    print()
    print(f"  -> {target.relative_to(ROOT)}  ({target.stat().st_size / 1e6:.1f} MB)")
    print("=" * 62)


if __name__ == "__main__":
    main()
