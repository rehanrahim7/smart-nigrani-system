"""
Put a small, realistic contractor work log into the database.

Purpose: on a fresh install the work-log table is empty, so the first thing a
judge sees when they open a project is an empty state. This seeds a handful of
entries against the highest-priority works so the MP dashboard has something
to show immediately, and so the "contractor records work, MP sees it" story
can be told without typing anything first.

These entries are ILLUSTRATIVE. The MPLADS source data contains no itemised
expenditure — that is precisely the gap the contractor role fills — so the line
items below are plausible construction costs, not real records. Say so if a
judge asks.

Running this twice will not duplicate anything: it clears its own seeded rows
first, identified by the seeding account.

Run:  python scripts/seed_demo_works.py
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import store  # noqa: E402

# Line items for a typical small civil work (a community hall, a road, a
# protective wall). Fractions are of the sanctioned amount, so the seeded log
# always sits sensibly inside the project's own budget.
TEMPLATE = [
    ("Site clearance and levelling", 0.08, "2026-01-06"),
    ("Buy Cement", 0.22, "2026-01-14"),
    ("Steel and reinforcement", 0.19, "2026-01-27"),
    ("Machinery hire", 0.16, "2026-02-09"),
    ("Masonry labour, first phase", 0.21, "2026-02-23"),
]

# How many of the top-priority works get a log. Small on purpose: a dashboard
# where every single project already has contractor data looks fabricated.
PROJECTS_TO_SEED = 6


def main() -> None:
    store.init_db()
    index = store.projects()

    print("=" * 62)
    print("Smart Nigrani System — seeding illustrative contractor work logs")
    print("=" * 62)

    # Clear anything a previous run created, so this is idempotent.
    with store.connect() as conn:
        removed = conn.execute(
            "DELETE FROM work_logs WHERE created_by LIKE 'vendor.%'"
        ).rowcount
    if removed:
        print(f"  cleared {removed} existing seeded entries")

    # Highest review priority first — those are the projects a judge will open.
    candidates = [
        p
        for p in store.ProjectIndex.sort(index.projects, "risk")
        if p.get("budget") and p.get("districtKey") and p.get("sanctioned")
    ][:PROJECTS_TO_SEED]

    if not candidates:
        sys.exit("No suitable projects found. Run scripts/prepare_data.py first.")

    total_entries = 0

    for position, project in enumerate(candidates):
        district = project["districtKey"]
        username = f"vendor.{_slug(district)}"

        account = store.get_user(username)
        if not account:
            print(f"  skip {project['id']} — no account {username}")
            continue

        budget = project["budget"]
        # Vary how far along each project is, so the demo does not show six
        # identical-looking logs.
        entries = TEMPLATE[: 2 + (position % 4)]

        for work, fraction, when in entries:
            store.add_work(
                work_id=f"wl-{uuid.uuid4().hex[:12]}",
                project_id=project["id"],
                work=work,
                cost=int(round(budget * fraction)),
                work_date=when,
                note=None,
                created_by=account["username"],
                created_by_name=account["name"],
            )
            total_entries += 1

        logged = sum(int(round(budget * f)) for _, f, _ in entries)
        print(
            f"  {project['riskLabel']:<16} {project['id']:<30} "
            f"{len(entries)} entries  {logged:>12,} of {budget:,}"
        )

    print()
    print(f"  {total_entries} entries across {len(candidates)} projects")
    print("  These are illustrative line items, not real MPLADS expenditure.")
    print("=" * 62)


def _slug(value: str) -> str:
    return "".join(c for c in value.lower() if c.isalnum())


if __name__ == "__main__":
    main()
