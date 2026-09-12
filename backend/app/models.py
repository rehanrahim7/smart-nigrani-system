"""Request and response schemas."""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("username")
    @classmethod
    def normalise(cls, value: str) -> str:
        return value.strip().lower()


class DemoLoginRequest(BaseModel):
    """One-click sign-in for a sample account. No password crosses the wire."""

    username: str = Field(min_length=1, max_length=120)

    @field_validator("username")
    @classmethod
    def normalise(cls, value: str) -> str:
        return value.strip().lower()


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    mpName: Optional[str] = None
    districtKey: Optional[str] = None
    constituency: Optional[str] = None
    organisation: Optional[str] = None


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class WorkCreate(BaseModel):
    """A line item a contractor adds against a project."""

    work: str = Field(min_length=2, max_length=200)
    cost: float = Field(gt=0, le=10_000_000_000)
    date: str
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("work")
    @classmethod
    def clean_work(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Describe the work")
        return cleaned

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        raw = (value or "").strip()
        try:
            parsed = date.fromisoformat(raw)
        except ValueError:
            raise ValueError("Use a YYYY-MM-DD date")
        # Guard against typos like year 20265 that would break sorting.
        if parsed.year < 2000 or parsed.year > 2100:
            raise ValueError("Date is outside the expected range")
        return parsed.isoformat()


class WorkOut(BaseModel):
    id: str
    srNo: int
    projectId: str
    work: str
    cost: int
    date: str
    note: Optional[str] = None
    createdBy: str
    createdByName: str
    createdAt: str


class WorkCreateOut(WorkOut):
    """
    Response to adding a work entry.

    Carries the running total so the UI can warn when logged spend passes the
    sanctioned budget. The entry is still saved — recording over-spend is the
    point of the system, not something to block.
    """

    exceedsBudget: bool = False
    projectedTotal: int = 0
    budget: int = 0
