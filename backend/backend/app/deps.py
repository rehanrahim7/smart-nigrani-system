"""Shared FastAPI dependencies: who is calling, and what may they do."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from . import store
from .security import read_token


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """Resolve the caller from the Bearer token, or reject with 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = read_token(authorization.split(" ", 1)[1].strip())
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Re-read the user each request. If an account is changed or removed the
    # token stops working immediately rather than until it expires.
    row = store.get_user(claims.get("sub", ""))
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer exists"
        )
    return store.user_public(row)


ROLE_NAMES = {
    "mp": "Member of Parliament",
    "vendor": "contractor",
    "officer": "field officer",
    "agency": "implementing agency",
    "analyst": "research analyst",
}


def require_roles(*roles: str):
    """Guard a route to particular roles."""

    def guard(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This action is only available to: " + ", ".join(ROLE_NAMES.get(r, r) for r in roles),
            )
        return user

    return guard


def sees_risk(user: dict) -> bool:
    """Only oversight roles are sent what the four checks and the model found."""
    return user.get("role") in store.RISK_ROLES


def dataset_for(user: dict, requested: str | None = None) -> tuple[str, store.ProjectIndex]:
    """
    Which dataset this request reads. Everyone works on the base snapshot,
    except a research analyst, who can switch to a dataset they imported.
    """
    if user.get("role") != "analyst":
        return store.BASE_DATASET, store.projects()
    dataset_id = requested or store.active_dataset(user["username"])
    if dataset_id != store.BASE_DATASET and store.dataset_owner(dataset_id) != user["username"]:
        dataset_id = store.BASE_DATASET
    index = store.dataset_index(dataset_id)
    if index is None:
        return store.BASE_DATASET, store.projects()
    return dataset_id, index


def visible_project(project_id: str, user: dict, dataset: str | None = None) -> dict:
    """
    Fetch a project the user is allowed to see.

    Returns 404 rather than 403 for a project outside the user's scope, so the
    API never confirms the existence of records a caller has no right to.
    """
    from .delivery import registered_as_project

    _, index = dataset_for(user, dataset)
    project = index.by_id.get(project_id)
    if not project and user.get("role") in store.TEAM_ROLES:
        row = store.registered_row(project_id)
        project = registered_as_project(row) if row else None
    if not project or not can_see(project, user):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def can_see(project: dict, user: dict) -> bool:
    """
    Is this one project inside the user's scope?

    The same rule as store.ProjectIndex.scoped, written for a single record.
    Every team role is matched on the member whose works they are, which
    guarantees that anything a contractor can write to, the member can read.
    A registered project is narrower still for the people assigned to it: a
    contractor or officer sees only the ones they were assigned.
    """
    role = user.get("role")

    if project.get("source") == "registered":
        if role not in store.TEAM_ROLES or project.get("mp") != user.get("mpName"):
            return False
        if role == "vendor":
            return project.get("contractor") == user["username"]
        if role == "officer":
            return project.get("officer") == user["username"]
        return True

    if role == "analyst":
        return True

    if role in store.TEAM_ROLES and user.get("mpName"):
        return project.get("mp") == user["mpName"]

    # Contractor account from an older database, scoped only by district.
    if role == "vendor" and user.get("districtKey"):
        return project.get("districtKey") == user["districtKey"]

    return False
