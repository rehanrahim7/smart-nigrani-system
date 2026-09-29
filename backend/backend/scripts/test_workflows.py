"""
End-to-end checks for every workflow added when the two sites were merged:
public browsing, field evidence, itemised expenses, review actions, the
agency's team and project registration, the member's updates, the research
workspace's import, and the Gemini unavailable state.

It runs the API in-process against a throwaway database, so it never leaves
test entries in the real one and needs no server running:

    python scripts/test_workflows.py

Exits non-zero on the first failure.
"""

from __future__ import annotations

import base64
import os
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="sns-test-"))
os.environ["SNS_DB"] = str(TMP / "test.sqlite3")
os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app import store  # noqa: E402

store.DATASETS_DIR = TMP / "datasets"

from app.main import app  # noqa: E402

PASSWORD = "nigrani"
RISK_KEYS = {"riskScore", "riskLabel", "anomaly", "signals", "scores", "checks", "ruleScore", "peerStats", "similar"}

# The smallest complete JPEG: start marker, a comment, end marker. Enough for
# the server's envelope check; the tests are about workflow, not pixels.
TINY_JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xfe\x00\x04ok\xff\xd9").decode()


def check(condition, message: str) -> None:
    if not condition:
        print(f"FAIL  {message}")
        sys.exit(1)
    print(f"PASS  {message}")


def uid() -> str:
    return str(uuid.uuid4())


def main() -> None:
    client = TestClient(app)
    client.__enter__()  # runs startup: creates tables and seeds accounts

    def login(username: str) -> dict:
        r = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
        check(r.status_code == 200, f"sign in as {username}")
        return {"Authorization": f"Bearer {r.json()['token']}"}

    # ---------------------------------------------------------------- public
    works = client.get("/api/public/works?limit=100").json()
    check(works["total"] == 4798, "public register lists all 4,798 works")
    check(all("mp" not in w and "constituency" not in w for w in works["items"]), "public rows carry no member or constituency")
    top = works["items"][0]
    check(top["riskLabel"] == "Critical Review", "public register is ordered by review priority")
    detail = client.get(f"/api/public/works/{top['id']}").json()
    check("mp" not in detail and "constituency" not in detail, "public detail carries no member or constituency")
    check(all(p["vendor"] is None for p in detail["payments"]), "public detail carries no payee names")
    check(detail["sources"], "public detail keeps its source-row references")
    member_name = store.projects().by_id[top["id"]]["mp"]
    found = client.get("/api/public/works", params={"search": member_name.split()[0]}).json()
    check(
        all(member_name.split()[0].lower() in (w["name"] or "").lower() for w in found["items"]),
        "public search cannot match a work by its member's name",
    )
    net = client.get("/api/public/network").json()
    check(net["members"] and all(m["alias"].startswith("MP ") for m in net["members"]), "network shows members as aliases")
    check(client.get("/api/public/works/NO-SUCH").status_code == 404, "unknown public work is 404")

    # ---------------------------------------------------------------- team
    mp = login("sanjay.jadhav")
    contractor = login("contractor.sanjay.jadhav")
    officer = login("officer.sanjay.jadhav")
    agency = login("agency.sanjay.jadhav")
    other_officer = login("officer.bajrang.sonwane")
    analyst = login("analyst1")

    mp_list = client.get("/api/projects?limit=200", headers=mp).json()
    officer_list = client.get("/api/projects?limit=200", headers=officer).json()
    check(mp_list["total"] == officer_list["total"] > 0, "member and field officer see the same works")
    check(not any(RISK_KEYS & set(i) for i in officer_list["items"]), "a field officer is sent no check or model results")
    agency_detail = client.get(f"/api/projects/{mp_list['items'][0]['id']}", headers=agency).json()
    check(not RISK_KEYS & set(agency_detail), "the agency is sent no check or model results")
    work_id = mp_list["items"][0]["id"]
    mp_detail = client.get(f"/api/projects/{work_id}", headers=mp).json()
    check("peers" in mp_detail and "similar" in mp_detail and mp_detail["payments"] is not None, "member detail has peers, similar works and payments")

    # ---------------------------------------------------------------- expenses
    items = [
        {"material": "Cement", "unit": "50 kg bag", "quantity": 100, "rate": 420, "invoice": "INV-1"},
        {"material": "Steel", "unit": "kg", "quantity": 250.5, "rate": 65.2, "invoice": "INV-2"},
    ]
    draft = uid()
    r = client.post(f"/api/projects/{work_id}/works", headers=contractor, json={
        "work": "Foundation materials", "date": "2026-09-01", "items": items, "stage": "Planning",
        "progress": 5, "clientId": draft,
    })
    check(r.status_code == 201, "contractor submits itemised materials")
    entry = r.json()
    check(entry["cost"] == round(100 * 420 + 250.5 * 65.2), f"server works out the total (₹{entry['cost']:,})")
    check(any("Planning stage" in f for f in entry["flags"]), "materials billed at Planning stage are flagged")
    again = client.post(f"/api/projects/{work_id}/works", headers=contractor, json={
        "work": "Foundation materials", "date": "2026-09-01", "items": items, "stage": "Planning",
        "progress": 5, "clientId": draft,
    })
    check(again.json()["id"] == entry["id"] and len(client.get(f"/api/projects/{work_id}/works", headers=mp).json()) == 1,
          "a retried submission is saved once")
    dup = client.post(f"/api/projects/{work_id}/works", headers=contractor, json={
        "work": "More cement", "date": "2026-09-02", "items": [items[0]], "stage": "Foundation", "progress": 10,
        "clientId": uid(),
    }).json()
    check(any("matches an earlier claim" in f for f in dup["flags"]), "a repeated invoice and material is flagged")
    check(client.post(f"/api/projects/{work_id}/works", headers=officer, json={"work": "x", "date": "2026-09-01", "cost": 5}).status_code == 403,
          "a field officer cannot add work log entries")
    bad = client.post(f"/api/projects/{work_id}/works", headers=contractor, json={
        "work": "Bad", "date": "2026-09-01", "items": [{**items[0], "quantity": -1}]})
    check(bad.status_code == 422, "a negative quantity is rejected")

    # ---------------------------------------------------------------- evidence
    photo_id = uid()
    r = client.post(f"/api/projects/{work_id}/evidence", headers=officer, json={
        "clientId": photo_id, "photo": TINY_JPEG, "note": "Plinth beam visible, shuttering in place",
        "stage": "Foundation", "progress": 12, "lat": 19.26, "lng": 76.77, "accuracy": 18,
    })
    check(r.status_code == 201 and r.json()["sha256"], "field officer uploads a photograph with location")
    r2 = client.post(f"/api/projects/{work_id}/evidence", headers=contractor, json={
        "clientId": uid(), "photo": TINY_JPEG, "note": "Same view from the road side",
    })
    check(any("same image file" in f for f in r2.json()["flags"]), "exact reuse of a photograph is flagged")
    check(any("No device location" in f for f in r2.json()["flags"]), "a photograph without location says so")
    check(client.post(f"/api/projects/{work_id}/evidence", headers=officer, json={
        "clientId": uid(), "photo": "data:image/jpeg;base64,AAAA", "note": "Broken upload"}).status_code == 400,
          "a broken JPEG is refused")
    photo = client.get(f"/api/evidence/{photo_id}/photo", headers=mp)
    check(photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"
          and "no-store" in photo.headers["cache-control"], "the member can open the photograph, never cached")
    check(client.get(f"/api/evidence/{photo_id}/photo", headers=other_officer).status_code == 404,
          "another member's officer cannot open it")
    check(client.get(f"/api/evidence/{photo_id}/photo").status_code == 401, "nobody signed out can open it")

    # ---------------------------------------------------------------- Gemini
    r = client.post(f"/api/evidence/{photo_id}/vision", headers=officer, json={"consent": False})
    check(r.status_code == 400, "no photograph is sent without consent")
    r = client.post(f"/api/evidence/{photo_id}/vision", headers=officer, json={"consent": True})
    check(r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"], "with no key, Gemini says it is not connected")
    check(client.get("/api/meta").json()["geminiConfigured"] is False, "meta reports Gemini as not configured")

    # ---------------------------------------------------------------- reviews
    r = client.post(f"/api/projects/{work_id}/reviews", headers=mp, json={
        "clientId": uid(), "targetKind": "worklog", "targetId": entry["id"],
        "decision": "Request clarification", "note": "Why were materials bought before the foundation stage?",
    })
    check(r.status_code == 201, "member asks for clarification on an expense")
    check(any(x["decision"] == "Request clarification" for x in client.get(f"/api/projects/{work_id}", headers=contractor).json()["reviews"]),
          "the contractor sees the clarification request")
    check(client.delete(f"/api/projects/{work_id}/works/{entry['id']}", headers=contractor).status_code == 404,
          "a reviewed entry can no longer be deleted")
    private = client.post(f"/api/projects/{work_id}/reviews", headers=mp, json={
        "clientId": uid(), "targetKind": "work", "decision": "Inspection required", "note": "Plan a site visit.",
    })
    check(private.status_code == 201, "member records a decision on the work")
    check(not any(x["targetKind"] == "work" for x in client.get(f"/api/projects/{work_id}", headers=contractor).json()["reviews"]),
          "the member's own decision is not shown to the contractor")
    check(client.post(f"/api/projects/{work_id}/reviews", headers=contractor, json={
        "clientId": uid(), "targetKind": "work", "decision": "Explained", "note": "Not for contractors"}).status_code == 403,
          "a contractor cannot record decisions")
    check(client.post(f"/api/projects/{work_id}/reviews", headers=mp, json={
        "clientId": uid(), "targetKind": "evidence", "targetId": "nope", "decision": "Evidence reviewed",
        "note": "Missing target"}).status_code == 400, "an action must point at a real submission")

    # ---------------------------------------------------------------- team and registration
    team = client.get("/api/team", headers=agency).json()
    check(team["canManage"] and {m["role"] for m in team["members"]} == {"mp", "vendor", "officer", "agency"},
          "the agency sees its whole team")
    r = client.post("/api/team", headers=agency, json={
        "username": "team.contractor2", "name": "Second contractor", "role": "vendor", "password": "longpassword"})
    check(r.status_code == 201, "the agency adds a contractor to the team")
    check(client.post("/api/team", headers=agency, json={
        "username": "team.boss", "name": "Boss", "role": "mp", "password": "longpassword"}).status_code == 422,
          "the agency cannot create a member or analyst account")
    check(client.post("/api/team", headers=mp, json={
        "username": "team.x", "name": "X", "role": "vendor", "password": "longpassword"}).status_code == 403,
          "a member cannot add accounts")
    second = login_as(client, "team.contractor2", "longpassword")
    check("team.contractor2" not in {a["username"] for a in client.get("/api/auth/demo-accounts").json()["accounts"]},
          "an account the agency created is never offered for one-click sign-in")

    project_id = uid()
    r = client.post("/api/registered", headers=agency, json={
        "clientId": project_id, "title": "Community hall roof repair, Bor Ranjani",
        "description": "Replace the tin roof and gutters of the village community hall.",
        "sector": "Community halls", "district": "Jalna", "budget": 450000,
        "sanctioned": "2026-01-10", "deadline": "2026-05-31",
        "contractor": "contractor.sanjay.jadhav", "officer": "officer.sanjay.jadhav",
    })
    check(r.status_code == 201 and r.json()["source"] == "registered", "the agency registers a project")
    check(client.post("/api/registered", headers=agency, json={
        "clientId": uid(), "title": "Wrong", "description": "Deadline before sanction date",
        "sector": "Roads and paths", "district": "Jalna", "budget": 1000, "sanctioned": "2026-05-01",
        "deadline": "2026-01-01", "contractor": "contractor.sanjay.jadhav", "officer": "officer.sanjay.jadhav",
    }).status_code == 400, "a completion target before the sanction date is refused")
    check(client.post("/api/registered", headers=agency, json={
        "clientId": uid(), "title": "Wrong", "description": "Contractor from another team",
        "sector": "Roads and paths", "district": "Jalna", "budget": 1000, "sanctioned": "2026-01-01",
        "deadline": "2026-02-01", "contractor": "contractor.bajrang.sonwane", "officer": "officer.sanjay.jadhav",
    }).status_code == 400, "only the team's own contractor can be assigned")
    mp_regs = client.get("/api/projects?source=registered", headers=mp).json()
    check(mp_regs["total"] == 1, "the member sees the registered project")
    check(client.get("/api/projects?source=registered", headers=contractor).json()["total"] == 1, "the assigned contractor sees it")
    check(client.get("/api/projects?source=registered", headers=second).json()["total"] == 0, "an unassigned contractor does not")
    check(client.get(f"/api/projects/{project_id}", headers=second).status_code == 404, "and cannot open it")
    check(client.get(f"/api/projects/{project_id}", headers=other_officer).status_code == 404, "another team cannot open it")

    updates = client.get("/api/updates", headers=mp).json()
    kinds = {i["kind"] for i in updates["items"]}
    check({"worklog", "evidence", "review"} <= kinds, "the member's updates list the expense, photograph and review")
    check(any(o["projectId"] == project_id and o["days"] > 0 for o in updates["overdue"]), "an overdue registered project is listed")
    check(client.get("/api/updates", headers=contractor).status_code == 403, "a contractor has no updates feed")

    # ---------------------------------------------------------------- research
    all_rows = client.get("/api/projects?limit=1", headers=analyst).json()
    check(all_rows["total"] == 4798, "an analyst reads every work")
    listed = client.get("/api/research/datasets", headers=analyst).json()
    check(listed["active"] == "base" and listed["datasets"][0]["summary"]["works"] == 4798, "the base snapshot is listed and active")
    raw = ROOT / "data" / "raw"
    files = [
        {"name": n, "text": (raw / n).read_text(encoding="utf-8")}
        for n in ("Allocated Limit for Honble MPs.csv", "Expenditure on Completed and On-going Works as on Date.csv",
                  "Works Completed.csv", "Works Recommended.csv", "Works Sanctioned.csv")
    ]
    check(client.post("/api/research/import", headers=analyst, json={"asOf": "2026-09-09", "files": files[:4]}).status_code == 422,
          "an import needs all five reports")
    early = client.post("/api/research/import", headers=analyst, json={"asOf": "2025-01-01", "files": files})
    check(early.status_code == 400 and "snapshot date" in early.json()["detail"], "a snapshot date earlier than the records is refused")
    swapped = [files[0], files[0], *files[2:]]
    check(client.post("/api/research/import", headers=analyst, json={"asOf": "2026-09-09", "files": swapped}).status_code == 400,
          "two copies of one report are refused")
    r = client.post("/api/research/import", headers=analyst, json={"asOf": "2026-09-09", "name": "Re-import", "files": files})
    check(r.status_code == 201 and r.json()["summary"]["works"] == 4798, "an import of the same reports gives the same 4,798 works")
    new_id = r.json()["id"]
    check(r.json()["meta"]["scoredByModel"] == 2437 and r.json()["meta"]["fourChecksRun"] == 0,
          "an import is scored by the model and marked not checked by the four checks")
    check(client.get("/api/research/datasets", headers=analyst).json()["active"] == new_id, "the import becomes the active dataset")
    in_new = client.get(f"/api/projects/{work_id}", headers=analyst).json()
    check(in_new["datasetId"] == new_id and in_new["anomaly"] == mp_detail["anomaly"], "the same work scores the same in the import")
    check(client.post("/api/research/datasets/active", headers=login("analyst2"), json={"id": new_id}).status_code == 404,
          "another analyst cannot open this import")
    r = client.post(f"/api/projects/{work_id}/reviews", headers=analyst, json={
        "clientId": uid(), "targetKind": "work", "decision": "Needs documents", "note": "Ask for the sanction order.",
    })
    check(r.status_code == 201 and r.json()["datasetId"] == new_id, "an analyst records a decision in the imported dataset")
    check(len(client.get("/api/research/reviews", headers=analyst).json()["items"]) == 1, "the analyst's decisions are listed")
    client.post("/api/research/datasets/active", headers=analyst, json={"id": "base"})
    check(client.get("/api/research/datasets", headers=analyst).json()["active"] == "base", "the analyst switches back to the base snapshot")
    check(client.get("/api/research/datasets", headers=mp).status_code == 403, "a member has no research workspace")

    print("\nAll workflow checks passed.")


def login_as(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    check(r.status_code == 200, f"sign in as {username}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


if __name__ == "__main__":
    main()
