"""
Read the five MPLADS report exports, join them into one record per work, and
run the in-app record checks.

Where this came from
--------------------
This is a line-by-line Python port of the earlier JavaScript pipeline
(lib/pipeline.mjs, "rules-1.0") that produced the 4,798-work dataset the
Isolation Forest was trained on. It is ported rather than rewritten because
the model's input features come out of this join: change how payments are
matched or how ages are counted and the model is fed numbers it never saw in
training. scripts/verify_data.py checks the port against the original output
field by field.

The same code runs in two places:

* scripts/prepare_data.py, to build the dataset the whole app serves, from
  the files in data/raw/.
* the research workspace's CSV import, so a reviewer can load a newer export
  of the same five reports and see it analysed the same way.

What a "record check" is
------------------------
Seven plain rules, each with a threshold anyone can read below. They look for
things worth a second look in the records themselves: a sanction far above
its recommendation, payments above the sanction, dates in an impossible order,
and so on. A check that fires is a reason to open the file, never a finding.
"""

from __future__ import annotations

import csv
import io
import math
import re
import unicodedata
from datetime import date

VERSION = "rules-1.0"

MISSING = {"", "NA", "N/A", "NULL"}

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

# The headers each report must carry. Spacing inside a header matters: the
# recommended-amount column really does have three spaces in it.
REQUIRED = {
    "allocated": ["State", "Hon'ble Members of Parliaments", "Constituency", "Allocated AMOUNT ( ₹ )"],
    "recommended": ["WORK", "Work description", "Recommended date", "RECOMMENDED AMOUNT   ( ₹ )", "Sanction Date"],
    "sanctioned": ["Work", "Work description", "Recommended date", "Sanction Date", "Sanction Amount ( ₹ )", "Work Status"],
    "completed": ["Work", "Work Description", "Completion Date", "Amount Disbursed ( ₹ )", "Image"],
    "payments": ["Work ID", "Work", "Expenditure Date", "Vendor Name", "Payment Status", "Fund Disbursed Amount ( ₹ )"],
}

# The file name each report is known by, used in source-row references.
FILE_NAMES = {
    "sanctioned": "Works Sanctioned.csv",
    "recommended": "Works Recommended.csv",
    "completed": "Works Completed.csv",
    "payments": "Expenditure on Completed and On-going Works as on Date.csv",
    "allocated": "Allocated Limit for Honble MPs.csv",
}

MAX_SOURCE_ROWS = 15_000
PAYMENT_STATUSES = {"Payment Success", "Payment In-Progress"}


class DataError(ValueError):
    """A problem with the uploaded files, worded for the person who uploaded them."""


# --------------------------------------------------------------------------
# cell parsing
# --------------------------------------------------------------------------

def _missing(value) -> bool:
    return value is None or str(value).strip().upper() in MISSING


def _value(value):
    return None if _missing(value) else " ".join(str(value).split())


def _round2(number: float) -> float:
    # JavaScript's Math.round rounds halves up; Python's round() does not.
    # Matching it keeps every total identical to the original pipeline.
    return math.floor(number * 100 + 0.5) / 100


def amount(value):
    if _missing(value):
        return None
    cleaned = re.sub(r"[,₹\s]", "", str(value))
    try:
        number = float(cleaned)
    except ValueError:
        raise DataError(f"Invalid monetary amount: {value!r}") from None
    if not math.isfinite(number) or number < 0:
        raise DataError(f"Invalid or negative monetary amount: {value!r}")
    result = _round2(number)
    return int(result) if result == int(result) else result


def parse_date(value):
    """DD-Mon-YYYY, as the portal exports it, to an ISO date string."""
    if _missing(value):
        return None
    match = re.fullmatch(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})", str(value).strip())
    if not match:
        raise DataError(f"Invalid date {value!r}: expected DD-Mon-YYYY, e.g. 09-Sep-2026")
    month = MONTHS.index(match.group(2).lower()) + 1 if match.group(2).lower() in MONTHS else 0
    try:
        return date(int(match.group(3)), month, int(match.group(1))).isoformat()
    except ValueError:
        raise DataError(f"Invalid calendar date: {value!r}") from None


def days(later: str | None, earlier: str | None):
    if not later or not earlier:
        return None
    return (date.fromisoformat(later) - date.fromisoformat(earlier)).days


def parse_csv(text: str) -> list[dict]:
    """
    Rows whose first cell is a serial number. Header rows repeated inside the
    export, totals and footers all fail that test and are left out.
    """
    text = text.lstrip("﻿")
    try:
        rows = [row for row in csv.reader(io.StringIO(text, newline="")) if any(c.strip() for c in row)]
    except csv.Error as error:
        raise DataError(f"Malformed CSV: {error}") from None
    if not rows:
        return []
    headers = [h.strip() for h in rows[0]]
    if len(set(headers)) != len(headers):
        raise DataError("Missing or duplicate CSV headers")
    out = []
    for row in rows[1:]:
        if not row or not re.fullmatch(r"\d+", row[0].strip()):
            continue
        if len(row) != len(headers):
            raise DataError("A CSV row has a different number of columns from its header")
        out.append(dict(zip(headers, row)))
    return out


def work_key(raw) -> str | None:
    """'WS/ MP667/2025-2026/159631-Construction of ...' -> 'WS/MP667/2025-2026/159631'"""
    match = re.match(r"(WS/MP\d+/\d{4}-\d{4}/\d+)", re.sub(r"\s+", "", str(raw or "")))
    return match.group(1) if match else None


def work_type(raw) -> str:
    """The kind of work, written after the id in the Work column."""
    return re.sub(r"^WS/\s*MP\d+/\d{4}-\d{4}/\d+-|^NA-", "", str(raw or ""), count=1).strip()


def _norm(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text.lower())
    kept = "".join(c if unicodedata.category(c)[0] in "LN" or c.isspace() else " " for c in folded)
    return " ".join(kept.split())


def _quantile(sorted_values: list[float], q: float) -> float:
    position = (len(sorted_values) - 1) * q
    index = math.floor(position)
    upper = sorted_values[min(index + 1, len(sorted_values) - 1)]
    return sorted_values[index] + (upper - sorted_values[index]) * (position - index)


def _js_round(number: float) -> int:
    return math.floor(number + 0.5)


# --------------------------------------------------------------------------
# the join
# --------------------------------------------------------------------------

def _kind_of(first_row: dict) -> str | None:
    """Recognise a report by its characteristic column, not by its file name."""
    if "Allocated AMOUNT ( ₹ )" in first_row:
        return "allocated"
    if "Payment Status" in first_row:
        return "payments"
    if "Completion Date" in first_row:
        return "completed"
    if "Work Status" in first_row:
        return "sanctioned"
    if "RECOMMENDED AMOUNT   ( ₹ )" in first_row:
        return "recommended"
    return None


def read_reports(files: list[tuple[str, str]]) -> dict[str, list[dict]]:
    """
    Sort five (name, text) pairs into the five report types, validating each.
    Raises DataError with a sentence a reviewer can act on.
    """
    tables: dict[str, list[dict]] = {}
    names: dict[str, str] = {}
    total = 0
    for name, text in files:
        rows = parse_csv(text)
        if not rows:
            raise DataError(f"{name} has no records")
        if any((row.get("State") or "").strip() != "Maharashtra" for row in rows):
            raise DataError(f"{name}: this pilot accepts Maharashtra report exports only")
        kind = _kind_of(rows[0])
        if not kind:
            raise DataError(f"{name} is not one of the five supported MPLADS reports")
        if kind in tables:
            raise DataError(f"{name} and {names[kind]} are the same kind of report. Upload one of each.")
        tables[kind] = rows
        names[kind] = name
        total += len(rows)
    if len(tables) != 5:
        missing = sorted(set(REQUIRED) - set(tables))
        raise DataError("All five report types are required. Missing: " + ", ".join(FILE_NAMES[k] for k in missing))
    if total > MAX_SOURCE_ROWS:
        raise DataError(f"This pilot supports up to {MAX_SOURCE_ROWS:,} source rows; these files hold {total:,}")
    for kind, columns in REQUIRED.items():
        for column in columns:
            if column not in tables[kind][0]:
                raise DataError(f"{names[kind]} is missing the column {column!r}")
    if any(row["Payment Status"] not in PAYMENT_STATUSES for row in tables["payments"]):
        raise DataError("Unrecognised payment status in the expenditure report. Review the export before importing.")
    return tables


def _new_work(row: dict, work_id: str, raw_work) -> dict:
    return {
        "id": work_id,
        "category": work_type(raw_work),
        "schemeCategory": _value(row.get("Work category") or row.get("Work Category")),
        "description": _value(row.get("Work description", row.get("Work Description"))),
        "mp": _value(row.get("Hon'ble Members of Parliament")),
        "constituency": _value(row.get("Constituency")),
        "authority": _value(row.get("IDA")),
        "state": _value(row.get("State")),
        "recommended": None,
        "sanctioned": None,
        "completed": None,
        "recommendedAmount": None,
        "sanctionAmount": None,
        "completionAmount": None,
        "status": None,
        "payments": [],
        "sources": [],
        "flags": [],
        "score": 0,
        "peers": [],
        "similar": [],
    }


def analyze(files: list[tuple[str, str]], as_of: str) -> dict:
    """
    Join the five reports and run the record checks.

    Returns {"summary": {...}, "works": [...]}. Works are sorted by id, which
    is also the order their public references (SNS-0001 ...) follow.
    """
    try:
        if date.fromisoformat(as_of).isoformat() != as_of:
            raise ValueError
    except ValueError:
        raise DataError("Choose a valid snapshot date (YYYY-MM-DD)") from None

    tables = read_reports(files)
    records: dict[str, dict] = {}
    issues: list[dict] = []

    for row in tables["sanctioned"]:
        work_id = work_key(row["Work"])
        if not work_id or work_id in records:
            raise DataError("The sanctioned report has a missing or repeated work ID")
        work = _new_work(row, work_id, row["Work"])
        work.update(
            recommended=parse_date(row["Recommended date"]),
            sanctioned=parse_date(row["Sanction Date"]),
            sanctionAmount=amount(row["Sanction Amount ( ₹ )"]),
            status=_value(row["Work Status"]),
        )
        work["sources"].append({"file": FILE_NAMES["sanctioned"], "row": row["Sr. No."]})
        records[work_id] = work

    without_id = 0
    for row in tables["recommended"]:
        raw_id = work_key(row["WORK"])
        work_id = raw_id or f"REC-{row['Sr. No.']}"
        if not raw_id:
            without_id += 1
        work = records.get(work_id) or _new_work(row, work_id, row["WORK"])
        if any(s["file"] == FILE_NAMES["recommended"] for s in work["sources"]):
            raise DataError(f"Repeated recommendation work ID {work_id}")
        work["recommendedAmount"] = amount(row["RECOMMENDED AMOUNT   ( ₹ )"])
        recommended_on = parse_date(row["Recommended date"])
        sanction_on = parse_date(row["Sanction Date"])
        if work["recommended"] and recommended_on != work["recommended"]:
            issues.append({"type": "Recommendation date differs", "id": work_id})
        work["recommended"] = work["recommended"] or recommended_on
        work["recommendationSanctionDate"] = sanction_on
        if not work.get("schemeCategory"):
            work["schemeCategory"] = _value(row.get("Work category"))
        work["sources"].append({"file": FILE_NAMES["recommended"], "row": row["Sr. No."]})
        records[work_id] = work

    for row in tables["completed"]:
        work_id = work_key(row["Work"])
        if not work_id:
            raise DataError("The completed report has a row without a valid work ID")
        work = records.get(work_id) or _new_work(row, work_id, row["Work"])
        if work["completed"]:
            raise DataError(f"Repeated completed work ID {work_id}")
        work["completed"] = parse_date(row["Completion Date"])
        work["completionAmount"] = amount(row["Amount Disbursed ( ₹ )"])
        work["imageLabel"] = _value(row.get("Image"))
        work["sources"].append({"file": FILE_NAMES["completed"], "row": row["Sr. No."]})
        records[work_id] = work

    for row in tables["payments"]:
        work_id = work_key(row["Work ID"])
        if not work_id:
            raise DataError("The expenditure report has a row without a valid work ID")
        work = records.get(work_id) or _new_work(row, work_id, row["Work"])
        work["payments"].append(
            {
                "date": parse_date(row["Expenditure Date"]),
                "amount": amount(row["Fund Disbursed Amount ( ₹ )"]),
                "vendor": _value(row["Vendor Name"]),
                "status": _value(row["Payment Status"]),
                "row": row["Sr. No."],
            }
        )
        records[work_id] = work

    works = sorted(records.values(), key=lambda w: w["id"])
    mps = sorted({w["mp"] or "" for w in works})
    areas = sorted({w["constituency"] or "" for w in works})
    authorities = sorted({w["authority"] or "" for w in works})

    groups: dict[str, list[dict]] = {}
    description_groups: dict[str, list[dict]] = {}

    for index, work in enumerate(works):
        work["alias"] = f"SNS-{index + 1:04d}"
        work["mpAlias"] = f"MP {mps.index(work['mp'] or '') + 1:02d}"
        work["areaAlias"] = f"Area {areas.index(work['constituency'] or '') + 1:02d}"
        work["authorityAlias"] = f"Authority {authorities.index(work['authority'] or '') + 1:02d}"
        work["paid"] = _round2(sum(p["amount"] or 0 for p in work["payments"] if p["status"] == "Payment Success"))
        work["pending"] = _round2(sum(p["amount"] or 0 for p in work["payments"] if p["status"] == "Payment In-Progress"))
        work["sanctionInterval"] = days(work["sanctioned"], work["recommended"])
        work["age"] = days(as_of, work["sanctioned"])
        work["duration"] = days(work["completed"], work["sanctioned"])
        work["stage"] = (
            "Completed in export" if work["completed"] else "Sanctioned" if work["sanctioned"] else "Recommendation only"
        )
        peer_key = "|".join([work["authority"] or "", work["category"] or "", (work["sanctioned"] or "")[:4]])
        work["peerGroup"] = peer_key
        if (work["sanctionAmount"] or 0) > 0:
            groups.setdefault(peer_key, []).append(work)
        if work["description"] and len(work["description"]) > 30:
            description_groups.setdefault(f"{work['constituency'] or ''}|{work['category'] or ''}", []).append(work)
        for when in [work["recommended"], work["sanctioned"], work["completed"], *(p["date"] for p in work["payments"])]:
            if when and when > as_of:
                raise DataError(
                    f"The snapshot date {as_of} is earlier than dates in the records ({when}). "
                    "Use the date the reports were exported."
                )

    # Similar descriptions: word overlap within one constituency and kind of work.
    for group in description_groups.values():
        entries = [(w, set(_norm(w["description"]).split(" "))) for w in group]
        for i in range(len(entries)):
            a, a_words = entries[i]
            if len(a_words) < 6:
                continue
            for j in range(i + 1, len(entries)):
                b, b_words = entries[j]
                if len(b_words) < 6:
                    continue
                shared = len(a_words & b_words)
                similarity = shared / (len(a_words) + len(b_words) - shared)
                if similarity >= 0.85:
                    percent = _js_round(similarity * 100)
                    a["similar"].append({"id": b["id"], "similarity": percent})
                    b["similar"].append({"id": a["id"], "similarity": percent})

    for work in works:
        def flag(kind, points, title, detail):
            work["flags"].append({"kind": kind, "points": points, "title": title, "detail": detail})

        sanction = work["sanctionAmount"] or 0
        peers = [p for p in groups.get(work["peerGroup"], []) if p["id"] != work["id"]]
        if len(peers) >= 8:
            amounts = sorted(p["sanctionAmount"] for p in peers)
            median = _quantile(amounts, 0.5)
            q1 = _quantile(amounts, 0.25)
            q3 = _quantile(amounts, 0.75)
            ratio = _js_round(sanction / median * 100) / 100
            work["peerStats"] = {
                "count": len(peers),
                "median": median,
                "q1": q1,
                "q3": q3,
                "ratio": int(ratio) if ratio == int(ratio) else ratio,
            }
            if sanction > q3 + 3 * (q3 - q1) and sanction / median > 2.5:
                flag(
                    "cost",
                    25,
                    f"{work['peerStats']['ratio']}× peer median amount",
                    "Same authority, category and sanction calendar year. Total amounts only; quantities and "
                    "specifications are unavailable.",
                )
        if work["similar"]:
            work["similar"].sort(key=lambda s: -s["similarity"])
            work["similar"] = work["similar"][:5]
            flag(
                "duplicate",
                25,
                "Similar work description",
                "At least 85% token overlap in the same constituency and category. Separate phases, sites, or "
                "repeated standard descriptions may explain the match.",
            )
        interval = work["sanctionInterval"]
        if interval is not None and interval > 45:
            flag(
                "timing",
                12,
                f"{interval} days to sanction",
                "Measured from recommendation date. Authority receipt date, rejection history and administrative "
                "context are unavailable; this is not a confirmed compliance breach.",
            )
        if work["age"] is not None and work["age"] > 365 and not work["completed"]:
            flag(
                "timing",
                20,
                f"{work['age']} days since sanction",
                "No completion record in this export. Approved deadline, extensions and physical progress are "
                "unavailable.",
            )
        recommended_amount = work["recommendedAmount"] or 0
        if recommended_amount > 0 and sanction > recommended_amount * 1.1:
            flag(
                "amount",
                15,
                "Sanction exceeds recommendation by over 10%",
                "Compare the original and revised sanction documents before drawing a conclusion.",
            )
        if sanction > 0 and work["paid"] > sanction * 1.01:
            flag(
                "payment",
                20,
                "Recorded successful payments exceed sanction",
                "Check revisions and transaction reconciliation. The export has no unique transaction IDs.",
            )
        if (
            (interval is not None and interval < 0)
            or (work["duration"] is not None and work["duration"] < 0)
            or any(p["date"] and work["sanctioned"] and p["date"] < work["sanctioned"] for p in work["payments"])
        ):
            flag(
                "quality",
                15,
                "Date sequence needs checking",
                "At least one recorded milestone precedes its expected earlier milestone. Inspect the original "
                "records.",
            )
        work["score"] = min(100, sum(f["points"] for f in work["flags"]))
        work["payments"].sort(key=lambda p: p["date"] or "")
        work["peers"] = [p["id"] for p in peers] if len(peers) >= 8 else []

    def total(rows, column):
        return _round2(sum(amount(r[column]) or 0 for r in rows))

    summary = {
        "version": VERSION,
        "asOf": as_of,
        "counts": {kind: len(rows) for kind, rows in tables.items()},
        "works": len(works),
        "sanctioned": len(tables["sanctioned"]),
        "completed": len(tables["completed"]),
        "recommendationsWithoutId": without_id,
        "mpCount": len(mps),
        "areaCount": len(areas),
        "flagged": sum(1 for w in works if w["flags"]),
        "highPriority": sum(1 for w in works if w["score"] >= 40),
        "successfulPayments": sum(1 for r in tables["payments"] if r["Payment Status"] == "Payment Success"),
        "pendingPayments": sum(1 for r in tables["payments"] if r["Payment Status"] == "Payment In-Progress"),
        "totalSanctioned": total(tables["sanctioned"], "Sanction Amount ( ₹ )"),
        "totalRecommended": total(tables["recommended"], "RECOMMENDED AMOUNT   ( ₹ )"),
        "allocated": total(tables["allocated"], "Allocated AMOUNT ( ₹ )"),
        "paid": _round2(sum(w["paid"] for w in works)),
        "pending": _round2(sum(w["pending"] for w in works)),
        "statusDifferences": sum(1 for w in works if w["completed"] and w["status"] and w["status"] != "Work Completed"),
        "issues": issues,
    }
    return {"summary": summary, "works": works, "allocations": _allocations(tables["allocated"])}


def _allocations(rows: list[dict]) -> list[dict]:
    """The allocated-limit report, kept per member for the research overview."""
    return [
        {
            "mp": _value(r["Hon'ble Members of Parliaments"]),
            "constituency": _value(r["Constituency"]),
            "allocated": amount(r["Allocated AMOUNT ( ₹ )"]),
            "row": r["Sr. No."],
        }
        for r in rows
    ]


# --------------------------------------------------------------------------
# the model's five inputs
# --------------------------------------------------------------------------

def model_features(work: dict) -> list[float | None] | None:
    """
    The five numbers the Isolation Forest was trained on, built exactly the way
    analysis/train.py built them from this pipeline's output:

      0  log(1 + sanctioned amount)
      1  successful payments / sanctioned amount
      2  log(1 + number of payment rows, successful or in progress)
      3  days from recommendation to sanction (may be missing)
      4  days from sanction to the snapshot date

    Returns None for works the model was never trained to judge: those with no
    positive sanctioned amount or no sanction date.
    """
    sanction = work.get("sanctionAmount")
    if not sanction or work.get("age") is None:
        return None
    return [
        math.log1p(sanction),
        work["paid"] / sanction,
        math.log1p(len(work["payments"])),
        work["sanctionInterval"],
        work["age"],
    ]
