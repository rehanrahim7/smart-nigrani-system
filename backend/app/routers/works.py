"""Contractor work log: the Sr No / Work / Cost / Date table from the brief.

An MP can read a project's work log. Only a vendor can add to it, and only
for a project inside their own district.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from .. import store
from ..deps import current_user, require_roles, visible_project
from ..models import WorkCreate, WorkCreateOut, WorkOut

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
    payload: WorkCreate,
    user: dict = Depends(require_roles("vendor")),
) -> dict:
    project = visible_project(project_id, user)

    cost = int(round(payload.cost))
    if cost <= 0:
        raise HTTPException(status_code=422, detail="Cost must be greater than zero")

    # Warn, but do not block, when logged spend passes the sanctioned budget.
    # Over-spend is exactly the kind of thing the system exists to surface, so
    # recording it matters more than preventing it.
    existing = store.list_works(project["id"])
    budget = project.get("budget") or 0
    projected = sum(w["cost"] for w in existing) + cost

    record = store.add_work(
        work_id=f"wl-{uuid.uuid4().hex[:12]}",
        project_id=project["id"],
        work=payload.work,
        cost=cost,
        work_date=payload.date,
        note=payload.note,
        created_by=user["username"],
        created_by_name=user["name"],
    )
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
    """Undo for a mistyped entry. A vendor can only delete their own rows."""
    visible_project(project_id, user)
    if not store.delete_work(work_id, user["username"]):
        raise HTTPException(
            status_code=404, detail="Entry not found, or it was not added by you"
        )
    return {"deleted": work_id}
