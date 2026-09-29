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
    items: Optional[list[dict]] = None
    stage: Optional[str] = None
    progress: Optional[int] = None
    flags: list[str] = []


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


# ---------------------------------------------------------------------------
# delivery: itemised expenses, evidence, reviews, registration, team
# ---------------------------------------------------------------------------

STAGE_PATTERN = "^(Planning|Foundation|Construction|Finishing|Completed)$"
UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


def _clean(value: str) -> str:
    cleaned = " ".join((value or "").split())
    if not cleaned:
        raise ValueError("This field cannot be empty")
    return cleaned


class ExpenseItem(BaseModel):
    """One material line. The total is worked out by the server, never trusted from the browser."""

    material: str = Field(min_length=1, max_length=200)
    unit: str = Field(min_length=1, max_length=60)
    quantity: float = Field(gt=0, le=10_000_000)
    rate: float = Field(gt=0, le=100_000_000)
    invoice: str = Field(min_length=1, max_length=120)

    _strip = field_validator("material", "unit", "invoice")(classmethod(lambda cls, v: _clean(v)))


class WorkCreateItems(WorkCreate):
    """
    A work log entry. Either a single amount (the original Work / Cost / Date
    form) or a list of material lines whose total becomes the cost. Stage and
    progress are what the contractor reports; nobody has verified them.
    """

    cost: Optional[float] = Field(default=None, gt=0, le=10_000_000_000)  # type: ignore[assignment]
    items: Optional[list[ExpenseItem]] = Field(default=None, min_length=1, max_length=30)
    stage: Optional[str] = Field(default=None, pattern=STAGE_PATTERN)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    clientId: Optional[str] = Field(default=None, pattern=UUID_PATTERN)


class EvidenceCreate(BaseModel):
    """A field photograph, sent as a JPEG data URL after the browser has shrunk it."""

    clientId: str = Field(pattern=UUID_PATTERN)
    photo: str = Field(max_length=700_000)
    note: str = Field(min_length=5, max_length=3000)
    stage: Optional[str] = Field(default=None, pattern=STAGE_PATTERN)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0, le=100_000)

    _strip = field_validator("note")(classmethod(lambda cls, v: _clean(v)))


# Decisions on a whole work, and follow-up actions on one submission.
WORK_DECISIONS = ("Needs documents", "Inspection required", "Explained", "Review in progress")
SUBMISSION_ACTIONS = ("Request clarification", "Request site visit", "Evidence reviewed", "Escalate to authority")


class ReviewCreate(BaseModel):
    clientId: str = Field(pattern=UUID_PATTERN)
    targetKind: str = Field(pattern="^(work|worklog|evidence)$")
    targetId: Optional[str] = Field(default=None, max_length=80)
    decision: str
    note: str = Field(min_length=5, max_length=3000)
    dataset: Optional[str] = Field(default=None, max_length=60)

    _strip = field_validator("note")(classmethod(lambda cls, v: _clean(v)))


class ProjectRegister(BaseModel):
    clientId: str = Field(pattern=UUID_PATTERN)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=3000)
    sector: str = Field(min_length=2, max_length=80)
    district: str = Field(min_length=2, max_length=80)
    budget: float = Field(gt=0, le=10_000_000_000)
    sanctioned: str
    deadline: str
    contractor: str = Field(min_length=1, max_length=120)
    officer: str = Field(min_length=1, max_length=120)

    _strip = field_validator("title", "description", "sector", "district")(classmethod(lambda cls, v: _clean(v)))

    @field_validator("sanctioned", "deadline")
    @classmethod
    def check_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat((value or "").strip())
        except ValueError:
            raise ValueError("Use a YYYY-MM-DD date")
        if parsed.year < 2000 or parsed.year > 2100:
            raise ValueError("Date is outside the expected range")
        return parsed.isoformat()


class TeamMemberCreate(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern="^[a-z0-9][a-z0-9._-]*$")
    name: str = Field(min_length=2, max_length=120)
    role: str = Field(pattern="^(vendor|officer)$")
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username", mode="before")
    @classmethod
    def lower(cls, value: str) -> str:
        return (value or "").strip().lower()

    _strip = field_validator("name")(classmethod(lambda cls, v: _clean(v)))


class ImportFile(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    text: str


class DatasetImport(BaseModel):
    asOf: str
    name: Optional[str] = Field(default=None, max_length=120)
    files: list[ImportFile] = Field(min_length=5, max_length=5)


class VisionRequest(BaseModel):
    consent: bool
