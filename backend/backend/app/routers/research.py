"""
The research workspace: datasets, imports and a reviewer's own decisions.

A research analyst reads every work in a dataset, with the real names, and
can turn on anonymised presentation in the page for a demonstration. They can
import a newer export of the same five reports. An import is analysed by the
same join, record checks and model as the base snapshot, saved as a separate
dataset, and never overwrites anything.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import enrich, pipeline, store
from ..config import BASE_DIR
from ..deps import dataset_for, require_roles
from ..models import DatasetImport

router = APIRouter(prefix="/api/research", tags=["research"])

MAX_IMPORT_BYTES = 12 * 1024 * 1024

MODEL_CARD = BASE_DIR / "analysis" / "model-card.json"


def _base_entry() -> dict:
    index = store.projects()
    return {
        "id": store.BASE_DATASET,
        "name": "MPLADS Maharashtra reports (supplied snapshot)",
        "asOf": index.snapshot,
        "createdAt": index.generated_at,
        "summary": index.summary,
        "owner": None,
        "shared": True,
        "fourChecks": True,
    }


@router.get("/datasets")
def datasets(user: dict = Depends(require_roles("analyst"))) -> dict:
    """The base snapshot, which everyone shares, and the analyst's own imports, newest first."""
    own = [{**d, "shared": False, "fourChecks": False} for d in store.list_datasets(user["username"])]
    active, _ = dataset_for(user)
    return {"active": active, "datasets": [_base_entry(), *own]}


class ActiveDataset(BaseModel):
    id: str


@router.post("/datasets/active")
def choose_dataset(payload: ActiveDataset, user: dict = Depends(require_roles("analyst"))) -> dict:
    if payload.id != store.BASE_DATASET and store.dataset_owner(payload.id) != user["username"]:
        raise HTTPException(status_code=404, detail="Dataset not found")
    store.set_active_dataset(user["username"], payload.id)
    return {"active": payload.id}


@router.post("/import", status_code=201)
def import_dataset(payload: DatasetImport, user: dict = Depends(require_roles("analyst"))) -> dict:
    """
    Analyse five uploaded report CSVs and keep them as a new dataset.

    The files are validated by their columns, not their names: exactly one of
    each report, Maharashtra rows only, dates as DD-Mon-YYYY, no repeated work
    ids, known payment statuses, and nothing dated after the snapshot date.
    """
    size = sum(len(f.text.encode("utf-8")) for f in payload.files)
    if size > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="The five files together must be under 12 MB")

    try:
        analysis = pipeline.analyze([(f.name, f.text) for f in payload.files], payload.asOf)
    except pipeline.DataError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None

    dataset_id = f"ds-{uuid.uuid4().hex[:12]}"
    built = enrich.build(analysis, detectors=None, dataset_id=dataset_id)
    built["generatedAt"] = store.now_iso()
    store.DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    (store.DATASETS_DIR / f"{dataset_id}.json").write_text(
        json.dumps(built, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    name = payload.name or f"Import of {payload.asOf}"
    store.add_dataset(
        dataset_id=dataset_id, owner=user["username"], name=name, as_of=payload.asOf, summary=analysis["summary"]
    )
    store.set_active_dataset(user["username"], dataset_id)
    return {"id": dataset_id, "name": name, "summary": analysis["summary"], "meta": built["meta"]}


@router.get("/overview")
def overview(user: dict = Depends(require_roles("analyst")), dataset: str | None = None) -> dict:
    """Everything the overview screen needs about one dataset."""
    dataset_id, index = dataset_for(user, dataset)
    kinds: dict[str, int] = {}
    for project in index.projects:
        for check in project.get("checks") or []:
            kinds[check["kind"]] = kinds.get(check["kind"], 0) + 1
    model_card = json.loads(MODEL_CARD.read_text()) if MODEL_CARD.exists() else None
    return {
        "datasetId": dataset_id,
        "snapshot": index.snapshot,
        "summary": index.summary,
        "meta": index.meta,
        "allocations": index.allocations,
        "checkCounts": kinds,
        "model": model_card,
    }


@router.get("/reviews")
def my_reviews(user: dict = Depends(require_roles("analyst")), dataset: str | None = None) -> dict:
    """The analyst's own decisions in this dataset, newest first, with the work they concern."""
    dataset_id, index = dataset_for(user, dataset)
    items = store.reviews_by(user["username"], dataset_id)
    for item in items:
        project = index.by_id.get(item["projectId"]) or {}
        item["projectName"] = project.get("name")
        item["projectRef"] = project.get("anonId")
    return {"datasetId": dataset_id, "items": items}


@router.get("/network")
def research_network(
    user: dict = Depends(require_roles("analyst")),
    dataset: str | None = None,
    sector: str | None = None,
    district: str | None = None,
    risk: str | None = None,
    per_member: int = 4,
) -> dict:
    """The member-to-work network for the analyst's dataset, with real names (hidden in presentation mode by the page)."""
    from .public import build_network

    _, index = dataset_for(user, dataset)
    rows = index.filter(index.projects, sector=sector, district=district, risk=risk)
    return build_network(index, rows, max(1, min(12, per_member)), names=True)
