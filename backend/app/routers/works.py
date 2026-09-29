"""Contractor work log: the Sr No / Work / Cost / Date table from the brief.

Every team member can read a project's work log. Only a contractor can add to
it, and only for a project their account can see: the works of the member
they are attached to, or a registered project assigned to them.

An entry is either one amount, or a list of material lines (material, unit,
quantity, rate, invoice). For material lines the server multiplies and adds
up; the total the browser shows is a preview, never what gets stored.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from .. import delivery, store
from ..deps import current_user, require_roles, visible_project
from ..models import WorkCreateItems, WorkCreateOut, WorkOut

router = APIRouter(prefix="/api/projects", tags=["works"])


@router.get("/{project_id:path}/works", response_model=list[WorkOut])
def list_works(project_id: str, user: dict = Depends(current_user)) -> list[dict]:
    project = visible_project(project_id, user)
    return store.list_works(project["id"])


@router.post(
    "/{project_id:path}/works",
    response_model=WorkCreateOut,
    status_code=status.HTTP_201_CREATED,
)
def add_work(
    project_id: str,
    payload: WorkCreateItems,
    user: dict = Depends(require_roles("vendor")),
) -> dict:
    project = visible_project(project_id, user)

    # A retried submit (a timeout, a double click) must not record the same
    # claim twice. The browser sends one id per draft; the second arrival
    # gets the saved entry back.
    if payload.clientId:
        existing_entry = store.work_by_client_id(payload.clientId)
        if existing_entry:
            if existing_entry["project_id"] != project["id"] or existing_entry["created_by"] != user["username"]:
                raise HTTPException(status_code=409, detail="That submission id is already in use")
            saved = next(w for w in store.list_works(project["id"]) if w["id"] == existing_entry["id"])
            return {**saved, "exceedsBudget": False, "projectedTotal": 0, "budget": project.get("budget") or 0}

    items = None
    if payload.items:
        items = [
            {**item.model_dump(), "total": round(item.quantity * item.rate, 2)}
            for item in payload.items
        ]
        cost = int(round(sum(i["total"] for i in items)))
    elif payload.cost is not None:
        cost = int(round(payload.cost))
    else:
        raise HTTPException(status_code=422, detail="Enter a cost, or add at least one material line")
    if cost <= 0:
        raise HTTPException(status_code=422, detail="Cost must be greater than zero")

    existing = store.list_works(project["id"])
    budget = project.get("budget") or 0
    projected = sum(w["cost"] for w in existing) + cost

    flags = delivery.expense_flags(items or [], project, existing, payload.stage, cost) if items else []
    if not items and budget and projected > budget:
        flags.append(
            f"Entries recorded so far total ₹{projected:,}, above the ₹{budget:,} approved amount. "
            "These are claims entered by the contractor, not verified payments."
        )

    record = store.add_work(
        work_id=f"wl-{uuid.uuid4().hex[:12]}",
        project_id=project["id"],
        work=payload.work,
        cost=cost,
        work_date=payload.date,
        note=payload.note,
        created_by=user["username"],
        created_by_name=user["name"],
        items=items,
        stage=payload.stage,
        progress=payload.progress,
        flags=flags,
        client_id=payload.clientId,
    )
    # Warn, but do not block, when logged spend passes the approved amount.
    # Over-spend is exactly the kind of thing the system exists to surface, so
    # recording it matters more than preventing it.
    record["exceedsBudget"] = bool(budget and projected > budget)
    record["projectedTotal"] = projected
    record["budget"] = budget
    return record


@router.delete("/{project_id:path}/works/{work_id}")
def remove_work(
    project_id: str,
    work_id: str,
    user: dict = Depends(require_roles("vendor")),
) -> dict:
    """Undo for a mistyped entry. A vendor can only delete their own, unreviewed rows."""
    visible_project(project_id, user)
    if not store.delete_work(work_id, user["username"]):
        raise HTTPException(
            status_code=404,
            detail="Entry not found, not added by you, or already reviewed",
        )
    return {"deleted": work_id}
