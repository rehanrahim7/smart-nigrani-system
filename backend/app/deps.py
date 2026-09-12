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


def require_roles(*roles: str):
    """Guard a route to particular roles."""

    def guard(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action is only available to: {', '.join(roles)}",
            )
        return user

    return guard


def visible_project(project_id: str, user: dict) -> dict:
    """
    Fetch a project the user is allowed to see.

    Returns 404 rather than 403 for a project outside the user's scope, so the
    API never confirms the existence of records a caller has no right to.
    """
    index = store.projects()
    project = index.by_id.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = user.get("role")
    if role == "mp" and user.get("mpName") and project.get("mp") != user["mpName"]:
        raise HTTPException(status_code=404, detail="Project not found")
    if (
        role == "vendor"
        and user.get("districtKey")
        and project.get("districtKey") != user["districtKey"]
    ):
        raise HTTPException(status_code=404, detail="Project not found")
    return project
