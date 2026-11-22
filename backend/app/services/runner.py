"""Führt Solver-Läufe im Hintergrund aus (ein Lauf nach dem anderen)."""

import logging
from concurrent.futures import Future, ThreadPoolExecutor

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.services.problem import build_problem
from app.solver.cpsat import solve

log = logging.getLogger(__name__)


class SolverRunner:
    def __init__(self, session_factory: sessionmaker[Session], workers: int, default_seconds: int):
        self.session_factory = session_factory
        self.workers = workers
        self.default_seconds = default_seconds
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="solver")

    def submit(self, timetable_id: int, time_limit: int | None, keep_locked: bool) -> Future:
        return self._pool.submit(self.run, timetable_id, time_limit or self.default_seconds, keep_locked)

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)

    def run(self, timetable_id: int, time_limit: int, keep_locked: bool) -> None:
        with self.session_factory() as session:
            tt = session.get(models.Timetable, timetable_id)
            if tt is None:
                return
            tt.status, tt.message = "running", ""
            session.commit()
            try:
                locked = (
                    list(
                        session.scalars(
                            select(models.Placement).where(
                                models.Placement.timetable_id == timetable_id, models.Placement.locked
                            )
                        )
                    )
                    if keep_locked
                    else []
                )
                problem = build_problem(session, fixed=locked)
                result = solve(problem, time_limit=time_limit, workers=self.workers)
                tt = session.get(models.Timetable, timetable_id)
                if tt is None:  # inzwischen gelöscht
                    return
                tt.solve_seconds = round(result.seconds, 2)
                if not result.ok:
                    tt.status, tt.message = "failed", "\n".join(result.messages)
                    session.commit()
                    return
                session.execute(delete(models.Placement).where(models.Placement.timetable_id == timetable_id))
                session.add_all(
                    models.Placement(
                        timetable_id=timetable_id,
                        lesson_id=p.lesson_id,
                        day=p.day,
                        period=p.period,
                        length=p.length,
                        room_id=p.room_id,
                        locked=p.locked,
                    )
                    for p in result.placements
                )
                tt.status = "done"
                tt.score = result.objective
                tt.message = (
                    "Optimaler Plan gefunden."
                    if result.status == "optimal"
                    else ("Gültiger Plan gefunden. Mit mehr Rechenzeit wird er eventuell noch besser.")
                )
                session.commit()
            except Exception as exc:  # noqa: BLE001 – Fehler soll im Plan sichtbar werden
                log.exception("Solver-Lauf %s fehlgeschlagen", timetable_id)
                session.rollback()
                tt = session.get(models.Timetable, timetable_id)
                if tt is not None:
                    tt.status, tt.message = "failed", f"Interner Fehler: {exc}"
                    session.commit()
