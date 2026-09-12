"""Smart Nigrani System API — Smart Nigrani System (SIH26102).

Serves MPLADS project data, explainable review-priority scores, and the
contractor work log, to the React dashboard.

Run:  uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from . import config, store
from .routers import auth, projects, public, stats, works

logger = logging.getLogger("sns")
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

app = FastAPI(
    title="Smart Nigrani System API",
    description=(
        "Smart Nigrani System — MPLADS monitoring, anomaly review and "
        "contractor work logging."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Project payloads are highly repetitive JSON and compress by roughly 8x.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.include_router(auth.router)
app.include_router(public.router)
app.include_router(stats.router)

# ORDER MATTERS. MPLADS work ids contain slashes (WS/MP681/2024-2025/143652),
# so the project-detail route has to use a greedy {project_id:path} converter.
# Registered first, that greedy matcher would swallow ".../works" as part of
# the id and return 404. Routes are matched in registration order, so the work
# log routes must be included before the project routes.
app.include_router(works.router)
app.include_router(projects.router)


@app.middleware("http")
async def timing_header(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Never leak a stack trace to the browser during a live demo."""
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on the server. Check the API logs."},
    )


@app.on_event("startup")
def startup() -> None:
    store.init_db()

    # Seed accounts automatically the first time the API runs, so a teammate
    # who forgets the seed script still gets a working login.
    if store.count_users() == 0:
        logger.info("no accounts found — seeding demo accounts")
        try:
            import scripts.seed_users as seeder  # type: ignore

            seeder.main()
        except Exception:
            logger.exception("automatic seeding failed; run scripts/seed_users.py")

    index = store.projects()
    logger.info(
        "loaded %s projects (%s carrying a review signal) from snapshot %s",
        index.meta.get("totalProjects"),
        index.meta.get("withRiskSignal"),
        index.snapshot,
    )
    logger.info(
        "storage: local sqlite + projects.json%s",
        " (Supabase mirror configured — run scripts/sync_supabase.py to push)"
        if config.supabase_enabled()
        else "",
    )


@app.get("/", tags=["meta"])
def root() -> dict:
    index = store.projects()
    return {
        "name": "Smart Nigrani System API",
        "system": "Smart Nigrani System",
        "problemStatement": "SIH26102",
        "status": "running",
        "snapshot": index.snapshot,
        "projects": index.meta.get("totalProjects"),
        "docs": "/docs",
    }


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Used by the frontend to show a connection indicator."""
    index = store.projects()
    return {
        "ok": True,
        "projects": index.meta.get("totalProjects"),
        "accounts": store.count_users(),
        "snapshot": index.snapshot,
        "generatedAt": index.generated_at,
    }


@app.get("/api/meta", tags=["meta"])
def meta() -> dict:
    """Dataset provenance, shown in the About panel and used in the pitch."""
    index = store.projects()
    return {
        **index.meta,
        "snapshot": index.snapshot,
        "generatedAt": index.generated_at,
        "source": "MPLADS public reports — Works Recommended, Works Sanctioned, "
        "Works Completed, Expenditure, Allocated Limit for Hon'ble MPs",
        "state": "Maharashtra",
        "methodology": {
            "weights": {"cost": 0.30, "duplicate": 0.25, "delay": 0.25, "payment": 0.20},
            "multiSignalBonus": "5 points per active signal, capped at 3",
            "thresholds": {
                "Critical Review": 75,
                "High Review": 55,
                "Medium Review": 35,
                "Routine": 0,
            },
            "note": "Review priority ranks records for human attention. It is not "
            "a fraud probability and does not assert wrongdoing.",
        },
        "derivedFields": {
            "sector": "Worked out from the description text by keyword, because "
            "the category column in the source files puts 4,697 of 4,807 works "
            "under 'Normal/Others'. The rules are in scripts/prepare_data.py "
            "and can be read and checked by hand.",
        },
        # Shown word for word on the front page, so they are written the way a
        # person speaks rather than the way a data file is described.
        "knownLimits": [
            "The government files do not say where a work is, so every map pin "
            "sits at the centre of its district.",
            "The files do not say how much of a work is finished. That comes "
            "from what the contractor enters, where they have entered it.",
            "This covers Maharashtra only, because that is the data we have.",
        ],
    }
