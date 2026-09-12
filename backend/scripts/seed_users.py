"""
Create the login accounts, derived from the real data.

Two roles, matching the brief: one account per Member of Parliament in the
dataset, and one per implementing district for the vendor/contractor side.
Every account shares the same demo password so nothing has to be memorised on
stage.

Run:  python scripts/seed_users.py
It is also run automatically on first API startup if the users table is empty.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, store  # noqa: E402

# Honorifics that appear inside the MP name column and should not become part
# of a username.
TITLES = {"dr", "dr.", "shri", "smt", "adv", "adv.", "prof", "mr", "mrs", "ms", "hon"}


def slugify(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value or "")
    ascii_only = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", ascii_only.lower())


def username_for(full_name: str) -> str:
    """'DR. PRASHANT YADAORAO PADOLE' -> 'prashant.padole'"""
    parts = [
        p for p in re.split(r"\s+", (full_name or "").strip())
        if p and p.lower().strip(".") not in TITLES
    ]
    parts = [slugify(p) for p in parts]
    parts = [p for p in parts if p]
    if not parts:
        return "mp"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]}.{parts[-1]}"


def display_name(full_name: str) -> str:
    """Names arrive in ALL CAPS in some rows and Title Case in others."""
    cleaned = " ".join((full_name or "").split())
    if cleaned.isupper():
        return cleaned.title().replace("Dr.", "Dr.")
    return cleaned


def main() -> None:
    store.init_db()
    index = store.projects()

    print("=" * 62)
    print("Smart Nigrani System — seeding accounts")
    print("=" * 62)

    # Drop any account whose role is no longer supported. Seeding upserts
    # rather than replaces, so without this an account from an earlier schema
    # — the removed "ministry" role, for example — would survive a re-seed and
    # keep working. Roles are an access-control boundary; stale ones must not
    # linger in a database somebody is about to demo.
    removed = store.remove_unsupported_roles({"mp", "vendor"})
    if removed:
        print(f"  removed {removed} account(s) with a retired role")

    taken: Counter[str] = Counter()

    def unique(candidate: str) -> str:
        taken[candidate] += 1
        return candidate if taken[candidate] == 1 else f"{candidate}{taken[candidate]}"

    # ---- members of parliament ------------------------------------------
    members: dict[str, dict] = {}
    for project in index.projects:
        name = project.get("mp")
        if not name:
            continue
        entry = members.setdefault(
            name, {"constituencies": Counter(), "districts": Counter(), "count": 0}
        )
        entry["count"] += 1
        if project.get("constituency"):
            entry["constituencies"][project["constituency"]] += 1
        if project.get("district"):
            entry["districts"][project["district"]] += 1

    for name, entry in sorted(members.items()):
        constituency = (
            entry["constituencies"].most_common(1)[0][0]
            if entry["constituencies"]
            else None
        )
        store.create_user(
            user_id=f"user-mp-{slugify(name)}",
            username=unique(username_for(name)),
            password=config.DEMO_PASSWORD,
            name=display_name(name),
            role="mp",
            mp_name=name,
            constituency=constituency,
        )

    # ---- vendors / contractors, one per implementing district -----------
    districts: dict[str, Counter] = {}
    for project in index.projects:
        key = project.get("districtKey")
        if not key:
            continue
        districts.setdefault(key, Counter())[project.get("agency") or ""] += 1

    for key, agencies in sorted(districts.items()):
        pretty = key.title()
        store.create_user(
            user_id=f"user-vendor-{slugify(key)}",
            username=unique(f"vendor.{slugify(key)}"),
            password=config.DEMO_PASSWORD,
            name=f"{pretty} Works Contractor",
            role="vendor",
            district_key=key,
            organisation=agencies.most_common(1)[0][0] or None,
        )

    total = store.count_users()
    print(f"  member accounts          {len(members):>6}")
    print(f"  vendor accounts          {len(districts):>6}")
    print(f"  total in database        {total:>6}")
    print(f"  shared password          {config.DEMO_PASSWORD}")
    print()
    print("  sample logins")
    for row in store.sample_logins(8):
        print(f"    {row['username']:<28} {row['role']:<9} {row['scope']}")
    print("=" * 62)


if __name__ == "__main__":
    main()
