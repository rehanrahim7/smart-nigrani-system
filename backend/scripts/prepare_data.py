"""
Build the dataset the API serves, from the supplied MPLADS reports.

Inputs (data/raw/)
------------------
The five reports exported from the MPLADS portal for Maharashtra:

    Works Recommended.csv
    Works Sanctioned.csv
    Works Completed.csv
    Expenditure on Completed and On-going Works as on Date.csv
    Allocated Limit for Honble MPs.csv

plus the cleaned master and payment files that came with them
(NetraDrift_master_projects.csv, NetraDrift_payments.csv). Those two are used
here only as a cross-check: every sanctioned work is compared with them field
by field, and any disagreement is printed.

And from data/source/, the team's detector output (the four checks).

What it does
------------
1. Joins the five reports into one record per work (app/pipeline.py). This is
   the join the Isolation Forest was trained on, so the model's five inputs
   come out exactly as they did in training.
2. Runs the seven record checks (also app/pipeline.py).
3. Joins the four-check detector scores by work id and combines them into the
   review priority with the team's weights (app/enrich.py).
4. Scores every sanctioned work with the Isolation Forest (app/anomaly.py).
5. Writes data/projects.json.

Why the join changed
--------------------
An earlier version built from the detector pipeline's own master file. That
file lost the 7 sanctioned works whose ids carry stray tabs in the source
(e.g. "WS/\t MP667/2025-2026/159631"), and it counted days to 8 September
rather than to the 9 September snapshot the model was trained on. Fed those
inputs, 891 of the 2,437 trained works came out with a different model score
from the one the model itself produced in training. Building from the reports
with the original join puts every one of them back: scripts/verify_data.py
checks all 2,437.

Run:  python scripts/prepare_data.py
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import enrich, pipeline  # noqa: E402

csv.field_size_limit(10_000_000)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SOURCE = ROOT / "data" / "source"
OUT = ROOT / "data" / "projects.json"

# Snapshot date of the MPLADS extract. Ages are measured against this, not
# against today, so the numbers on screen never drift from the analysis.
SNAPSHOT = "2026-09-09"

REPORTS = [
    "Allocated Limit for Honble MPs.csv",
    "Expenditure on Completed and On-going Works as on Date.csv",
    "Works Completed.csv",
    "Works Recommended.csv",
    "Works Sanctioned.csv",
]


def read_reports() -> list[tuple[str, str]]:
    files = []
    for name in REPORTS:
        path = RAW / name
        if not path.exists():
            sys.exit(f"missing source file: {path}")
        files.append((name, path.read_text(encoding="utf-8")))
    return files


def cross_check(works: list[dict]) -> list[str]:
    """
    Compare the join with the cleaned master file that came with the data.
    Returns one line per disagreement, so nothing differs silently.
    """
    master_path = RAW / "NetraDrift_master_projects.csv"
    if not master_path.exists():
        return ["cleaned master file not present, cross-check skipped"]
    by_id = {w["id"]: w for w in works}
    notes = []
    with master_path.open(newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    for row in rows:
        work = by_id.get(row["work_id"])
        if not work:
            notes.append(f"{row['work_id']}: in the cleaned master, not in the reports")
            continue
        count = int(float(row["payment_event_count"] or 0))
        if count != len(work["payments"]):
            notes.append(
                f"{work['id']}: cleaned master has {count} payment(s), the reports have "
                f"{len(work['payments'])} (payment row ids carry whitespace)"
            )
        if float(row["sanctioned_amount_inr"] or 0) != float(work["sanctionAmount"] or 0):
            notes.append(f"{work['id']}: sanctioned amount differs")
        if (row["sanction_date"] or None) != work["sanctioned"]:
            notes.append(f"{work['id']}: sanction date differs")
        if (row["completion_date"] or None) != work["completed"]:
            notes.append(f"{work['id']}: completion date differs")
    sanctioned = sum(1 for w in works if w["sanctioned"])
    if len(rows) != sanctioned:
        notes.append(f"cleaned master has {len(rows)} works, the reports have {sanctioned} sanctioned works")
    return notes


def main() -> None:
    print("=" * 62)
    print("Smart Nigrani System - preparing project dataset")
    print("=" * 62)

    analysis = pipeline.analyze(read_reports(), SNAPSHOT)
    summary = analysis["summary"]
    print(f"  source rows              {sum(summary['counts'].values()):>7}  {summary['counts']}")
    print(f"  works after the join     {summary['works']:>7}")
    print(f"  sanctioned               {summary['sanctioned']:>7}")
    print(f"  recommendations, no id   {summary['recommendationsWithoutId']:>7}")

    notes = cross_check(analysis["works"])
    print(f"  cross-check with the cleaned master: {len(notes)} note(s)")
    for note in notes:
        print(f"    - {note}")

    detectors = enrich.load_detectors(SOURCE)
    payload = enrich.build(analysis, detectors=detectors, dataset_id="base")
    payload["generatedAt"] = datetime.now().isoformat(timespec="seconds")
    payload["crossCheck"] = notes

    ids = [p["id"] for p in payload["projects"]]
    if len(ids) != len(set(ids)):
        sys.exit("FATAL: duplicate project ids")

    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # analysis/train.py reads its input from data/analyzed.json. Only written
    # on request, because running train.py afterwards replaces the model.
    if "--training-input" in sys.argv:
        training = ROOT / "data" / "analyzed.json"
        training.write_text(json.dumps({"summary": summary, "works": analysis["works"]}), encoding="utf-8")
        print(f"  training input written to {training.relative_to(ROOT)}")

    meta = payload["meta"]
    print("  ---------------------------------------------------------")
    print(f"  projects written         {meta['totalProjects']:>7}")
    print(f"  run through four checks  {meta['fourChecksRun']:>7}")
    print(f"  scored by the model      {meta['scoredByModel']:>7}")
    print(f"  with a record check      {meta['withRecordChecks']:>7}")
    print(f"  placed on the map        {meta['withCoordinates']:>7}")
    print(f"  districts / MPs          {meta['districts']:>7} / {meta['members']}")
    print()
    print("  review priority distribution")
    for name in ("Critical Review", "High Review", "Medium Review", "Routine", enrich.NOT_CHECKED):
        print(f"    {name:<18} {meta['labelCounts'].get(name, 0):>6}")
    print()
    print(f"  -> {OUT.relative_to(ROOT)}  ({OUT.stat().st_size / 1e6:.1f} MB)")
    print("=" * 62)


if __name__ == "__main__":
    main()
