"""Pläne: erzeugen, berechnen, manuell bearbeiten, Konflikte prüfen."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.db import get_session
from app.services.conflicts import find_conflicts
from app.services.problem import get_settings, load_lessons, load_periods

router = APIRouter(prefix="/api/timetables", tags=["Pläne"])
SessionDep = Annotated[Session, Depends(get_session)]


def get_timetable(session: Session, timetable_id: int) -> models.Timetable:
    tt = session.scalar(
        select(models.Timetable)
        .where(models.Timetable.id == timetable_id)
        .options(selectinload(models.Timetable.placements))
    )
    if tt is None:
        raise HTTPException(404, "Plan nicht gefunden")
    return tt


def conflicts_for(
    session: Session, tt: models.Timetable, only: set[int] | None = None
) -> list[schemas.Conflict]:
    lessons = {lesson.id: lesson for lesson in load_lessons(session)}
    rooms = {r.id: r for r in session.scalars(select(models.Room))}
    return find_conflicts(
        tt.placements, lessons, get_settings(session).days, load_periods(session), rooms, only=only
    )


def start_solve(request: Request, session: Session, tt: models.Timetable, req: schemas.SolveRequest) -> None:
    if tt.status in ("queued", "running"):
        raise HTTPException(409, "Für diesen Plan läuft schon eine Berechnung")
    tt.status, tt.message = "queued", ""
    session.commit()
    request.app.state.runner.submit(tt.id, req.time_limit, req.keep_locked, req.relax)


@router.get("", response_model=list[schemas.TimetableSummary])
def list_timetables(session: SessionDep):
    return session.scalars(select(models.Timetable).order_by(models.Timetable.created_at.desc())).all()


@router.post("", response_model=schemas.TimetableSummary, status_code=201)
def create_timetable(data: schemas.TimetableCreate, request: Request, session: SessionDep):
    tt = models.Timetable(name=data.name)
    session.add(tt)
    session.commit()
    start_solve(request, session, tt, schemas.SolveRequest(time_limit=data.time_limit, relax=data.relax))
    return tt


@router.get("/{timetable_id}", response_model=schemas.TimetableOut)
def read_timetable(timetable_id: int, session: SessionDep):
    return get_timetable(session, timetable_id)


@router.patch("/{timetable_id}", response_model=schemas.TimetableSummary)
def rename_timetable(timetable_id: int, data: schemas.TimetableRename, session: SessionDep):
    tt = get_timetable(session, timetable_id)
    tt.name = data.name
    session.commit()
    return tt


@router.delete("/{timetable_id}", status_code=204)
def delete_timetable(timetable_id: int, session: SessionDep):
    tt = get_timetable(session, timetable_id)
    session.delete(tt)
    session.commit()
    return Response(status_code=204)


@router.post("/{timetable_id}/solve", response_model=schemas.TimetableSummary)
def solve_timetable(timetable_id: int, req: schemas.SolveRequest, request: Request, session: SessionDep):
    tt = get_timetable(session, timetable_id)
    start_solve(request, session, tt, req)
    return tt


@router.get("/{timetable_id}/conflicts", response_model=list[schemas.Conflict])
def list_conflicts(timetable_id: int, session: SessionDep):
    return conflicts_for(session, get_timetable(session, timetable_id))


def _placement(tt: models.Timetable, placement_id: int) -> models.Placement:
    if tt.status in ("queued", "running"):
        raise HTTPException(409, "Der Plan wird gerade berechnet")
    for p in tt.placements:
        if p.id == placement_id:
            return p
    raise HTTPException(404, "Block nicht in diesem Plan")


def _check_or_rollback(session: Session, tt: models.Timetable, ids: set[int], force: bool) -> None:
    session.flush()
    found = conflicts_for(session, tt, only=ids)
    if found and not force:
        session.rollback()
        raise HTTPException(
            409, {"message": "Die Änderung erzeugt Konflikte", "conflicts": [c.model_dump() for c in found]}
        )
    tt.updated_at = datetime.now(UTC)


@router.patch("/{timetable_id}/placements/{placement_id}", response_model=schemas.PlacementOut)
def update_placement(
    timetable_id: int, placement_id: int, data: schemas.PlacementUpdate, session: SessionDep
):
    """Block verschieben, Raum ändern oder fixieren. Bei Konflikten 409, außer mit force=true."""
    tt = get_timetable(session, timetable_id)
    pl = _placement(tt, placement_id)
    if data.day is not None:
        pl.day = data.day
    if data.period is not None:
        pl.period = data.period
    if data.clear_room:
        pl.room_id = None
    elif data.room_id is not None:
        if session.get(models.Room, data.room_id) is None:
            raise HTTPException(422, "Unbekannter Raum")
        pl.room_id = data.room_id
    if data.locked is not None:
        pl.locked = data.locked
    _check_or_rollback(session, tt, {pl.id}, data.force)
    session.commit()
    return pl


@router.post("/{timetable_id}/swap", response_model=list[schemas.PlacementOut])
def swap_placements(timetable_id: int, data: schemas.SwapRequest, session: SessionDep):
    """Zwei Blöcke tauschen ihre Zeit (die Räume bleiben bei ihrem Unterricht)."""
    tt = get_timetable(session, timetable_id)
    a, b = _placement(tt, data.a), _placement(tt, data.b)
    (a.day, a.period), (b.day, b.period) = (b.day, b.period), (a.day, a.period)
    _check_or_rollback(session, tt, {a.id, b.id}, data.force)
    session.commit()
    return [a, b]
