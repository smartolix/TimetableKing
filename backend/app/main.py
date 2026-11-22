from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine

from app.config import settings
from app.db import make_engine, make_session_factory
from app.routers import files, masterdata, timetables
from app.services.runner import SolverRunner


def create_app(engine: Engine | None = None) -> FastAPI:
    engine = engine or make_engine(settings.database_url, pool_pre_ping=True)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.runner = SolverRunner(
            session_factory, settings.solver_workers, settings.solver_default_seconds
        )
        _reset_stale_runs(session_factory)
        yield
        app.state.runner.shutdown()

    app = FastAPI(title="TimetableKing", version="0.1.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
    )
    app.include_router(masterdata.router)
    app.include_router(timetables.router)
    app.include_router(files.router)

    @app.get("/api/health", tags=["System"])
    def health():
        return {"status": "ok"}

    return app


def _reset_stale_runs(session_factory) -> None:
    """Berechnungen, die bei einem Neustart unterbrochen wurden, als fehlgeschlagen markieren."""
    from sqlalchemy import update

    from app import models

    with session_factory() as session:
        session.execute(
            update(models.Timetable)
            .where(models.Timetable.status.in_(["queued", "running"]))
            .values(status="failed", message="Berechnung wurde durch einen Neustart unterbrochen.")
        )
        session.commit()


app = create_app()
