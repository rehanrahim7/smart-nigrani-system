"""
Check the dataset and the model, end to end, in a few seconds.

    python scripts/verify_data.py

What it proves
--------------
* The five reports still join into the numbers recorded when the model was
  trained: 4,798 works, 2,437 sanctioned, Rs 1,360,638,394 paid, and so on.
* Work ids are unique, and every work keeps its source-row references.
* The model's five inputs are built in the training order.
* The Python scoring gives exactly the score and percentile scikit-learn wrote
  for every one of the 2,437 trained works (analysis/training-scores.json).
* The review priority still comes out 4 Critical / 74 High / 186 Medium, and
  the model is not one of its weights.
* data/projects.json is up to date with all of the above.

Exits non-zero on the first failure, printing what went wrong.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import anomaly, enrich, pipeline  # noqa: E402
from scripts.prepare_data import SNAPSHOT, SOURCE, read_reports  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Recorded in the project handoff for the 2026-09-09 snapshot.
EXPECTED = {
    "works": 4798,
    "sanctioned": 2437,
    "completed": 937,
    "recommendationsWithoutId": 2361,
    "mpCount": 47,
    "areaCount": 47,
    "flagged": 2446,
    "highPriority": 30,
    "successfulPayments": 1639,
    "pendingPayments": 91,
    "totalSanctioned": 2345613683.87,
    "totalRecommended": 4608962957.87,
    "allocated": 7342285090.94,
    "paid": 1360638394,
    "pending": 121725689,
    "statusDifferences": 783,
}
EXPECTED_COUNTS = {"allocated": 49, "payments": 1730, "completed": 937, "recommended": 4776, "sanctioned": 2437}
EXPECTED_LABELS = {"Critical Review": 4, "High Review": 74, "Medium Review": 186}


def check(condition: bool, message: str) -> None:
    if not condition:
        print(f"FAIL  {message}")
        sys.exit(1)
    print(f"PASS  {message}")


def main() -> None:
    analysis = pipeline.analyze(read_reports(), SNAPSHOT)
    summary = analysis["summary"]
    works = analysis["works"]

    check(summary["counts"] == EXPECTED_COUNTS, f"source row counts {summary['counts']}")
    for key, value in EXPECTED.items():
        check(summary[key] == value, f"{key} = {summary[key]:,}")
    check(summary["asOf"] == "2026-09-09", "snapshot date is 2026-09-09")

    ids = [w["id"] for w in works]
    check(len(ids) == len(set(ids)), "work ids are unique")
    check(all(w["sources"] or w["payments"] for w in works), "every work keeps a source-row reference")
    check(
        all(p["row"] for w in works for p in w["payments"]),
        "every payment keeps its row number in the expenditure report",
    )
    check(
        all(w["id"] not in w["peers"] for w in works),
        "no work is its own peer",
    )

    # Feature order, checked on a work with every input present.
    sample = next(w for w in works if w["sanctionInterval"] is not None and len(w["payments"]) > 1)
    features = pipeline.model_features(sample)
    check(
        features
        == [
            math.log1p(sample["sanctionAmount"]),
            sample["paid"] / sample["sanctionAmount"],
            math.log1p(len(sample["payments"])),
            sample["sanctionInterval"],
            sample["age"],
        ],
        "model inputs are in training order: log amount, paid/amount, log payments, interval, age",
    )

    forest = anomaly.forest()
    check(forest is not None and len(forest.trees) == 160, "model loads with 160 trees")
    trained = json.loads((ROOT / "analysis" / "training-scores.json").read_text())["scores"]
    scored = {w["id"]: forest.score(pipeline.model_features(w)) for w in works if pipeline.model_features(w)}
    check(set(scored) == set(trained), f"the model scores exactly the {len(trained):,} works it was trained on")
    mismatched = [i for i in trained if scored[i] != trained[i]]
    check(not mismatched, f"score and percentile match training for all {len(trained):,} works {mismatched[:3]}")

    payload = enrich.build(analysis, detectors=enrich.load_detectors(SOURCE))
    labels = payload["meta"]["labelCounts"]
    check(
        all(labels.get(k) == v for k, v in EXPECTED_LABELS.items()),
        f"review priority: {labels.get('Critical Review')} Critical, {labels.get('High Review')} High, "
        f"{labels.get('Medium Review')} Medium",
    )
    sample_p = next(p for p in payload["projects"] if p["fourChecks"])
    recomputed = (
        0.30 * sample_p["scores"]["cost"]
        + 0.25 * sample_p["scores"]["duplicate"]
        + 0.25 * sample_p["scores"]["delay"]
        + 0.20 * sample_p["scores"]["payment"]
        + min(sample_p["activeSignals"], 3) * 5
    )
    check(
        abs(round(min(100, recomputed), 1) - sample_p["riskScore"]) < 0.051,
        "review priority is the four weighted checks plus the multi-signal bonus, with no model term",
    )

    shipped = json.loads((ROOT / "data" / "projects.json").read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in shipped["projects"]}
    fresh = {p["id"]: p for p in payload["projects"]}
    check(set(by_id) == set(fresh), "data/projects.json holds the same works as a fresh build")
    stale = [
        i for i, p in fresh.items()
        if (by_id[i]["anomaly"], by_id[i]["riskScore"], by_id[i]["totalPaid"]) != (p["anomaly"], p["riskScore"], p["totalPaid"])
    ]
    check(not stale, "data/projects.json scores match a fresh build (run prepare_data.py if this fails)")
    print("\nAll data and model checks passed.")


if __name__ == "__main__":
    main()
