"""
Create the login accounts, derived from the real data.

For every Member of Parliament in the data there is a team of four accounts:
the member, a contractor, a field officer and the implementing agency's desk.
All four are attached to the same member, so they see exactly the same list of
works, and anything the contractor or officer records shows up on the member's
screen. Two research analyst accounts read the whole dataset. Every account
shares the same demo password so nothing has to be memorised on stage.

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
    removed = store.remove_unsupported_roles(set(store.ROLES))
    if removed:
        print(f"  removed {removed} account(s) with a retired role")

    taken: Counter[str] = Counter()

    def unique(candidate: str) -> str:
        taken[candidate] += 1
        return candidate if taken[candidate] == 1 else f"{candidate}{taken[candidate]}"

    # ---- one member, and one contractor working for that member ---------
    members: dict[str, dict] = {}
    for project in index.projects:
        name = project.get("mp")
        if not name:
            continue
        entry = members.setdefault(
            name,
            {
                "constituencies": Counter(),
                "districts": Counter(),
                "district_keys": Counter(),
                "agencies": Counter(),
                "count": 0,
            },
        )
        entry["count"] += 1
        if project.get("constituency"):
            entry["constituencies"][project["constituency"]] += 1
        if project.get("district"):
            entry["districts"][project["district"]] += 1
        if project.get("districtKey"):
            entry["district_keys"][project["districtKey"]] += 1
        if project.get("agency"):
            entry["agencies"][project["agency"]] += 1

    def top(counter: Counter) -> str | None:
        return counter.most_common(1)[0][0] if counter else None

    for name, entry in sorted(members.items()):
        constituency = top(entry["constituencies"])
        district_key = top(entry["district_keys"])
        slug = slugify(name)

        store.create_user(
            user_id=f"user-mp-{slug}",
            username=unique(username_for(name)),
            password=config.DEMO_PASSWORD,
            name=display_name(name),
            role="mp",
            mp_name=name,
            district_key=district_key,
            constituency=constituency,
        )

        # The contractor account carries the SAME mp_name. That single field is
        # what makes both sides look at one list of works, so an entry added
        # here is visible to the member above.
        store.create_user(
            user_id=f"user-vendor-{slug}",
            username=unique(f"contractor.{username_for(name)}"),
            password=config.DEMO_PASSWORD,
            name=f"Contractor for {display_name(name)}",
            role="vendor",
            mp_name=name,
            district_key=district_key,
            constituency=constituency,
            organisation=top(entry["agencies"]),
        )

        store.create_user(
            user_id=f"user-officer-{slug}",
            username=unique(f"officer.{username_for(name)}"),
            password=config.DEMO_PASSWORD,
            name=f"Field officer for {display_name(name)}",
            role="officer",
            mp_name=name,
            district_key=district_key,
            constituency=constituency,
        )

        store.create_user(
            user_id=f"user-agency-{slug}",
            username=unique(f"agency.{username_for(name)}"),
            password=config.DEMO_PASSWORD,
            name=f"Implementing agency for {display_name(name)}",
            role="agency",
            mp_name=name,
            district_key=district_key,
            constituency=constituency,
            organisation=top(entry["agencies"]),
        )

    # Research analysts read every work. They belong to no member's team.
    for number in (1, 2):
        store.create_user(
            user_id=f"user-analyst-{number}",
            username=unique(f"analyst{number}"),
            password=config.DEMO_PASSWORD,
            name=f"Research analyst {number}",
            role="analyst",
        )

    # Contractor logins from the old district-only scheme would otherwise sit
    # alongside the new ones and show a different list of works.
    stale = store.remove_unpaired_vendors()
    if stale:
        print(f"  removed {stale} contractor account(s) not attached to a member")

    total = store.count_users()
    print(f"  member accounts          {len(members):>6}")
    print(f"  contractor accounts      {len(members):>6}")
    print(f"  field officer accounts   {len(members):>6}")
    print(f"  agency accounts          {len(members):>6}")
    print("  research analysts             2")
    print(f"  total in database        {total:>6}")
    print(f"  shared password          {config.DEMO_PASSWORD}")
    print()
    print("  sample logins")
    for row in store.sample_logins(8):
        print(f"    {row['username']:<28} {row['role']:<9} {row['scope']}")
    print("=" * 62)


if __name__ == "__main__":
    main()
