"""Stammdaten: Einstellungen/Zeitraster, Fächer, Lehrkräfte, Räume, Klassen, Unterricht."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_session
from app.services.problem import get_settings, load_lessons, load_periods

router = APIRouter(prefix="/api", tags=["Stammdaten"])
SessionDep = Annotated[Session, Depends(get_session)]


def commit_or_409(session: Session, what: str) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{what}: Kürzel/Name schon vergeben oder Eintrag wird noch verwendet."
        ) from exc


# ---- Einstellungen ----


def settings_out(session: Session) -> schemas.SettingsOut:
    s = get_settings(session)
    return schemas.SettingsOut(
        school_name=s.school_name,
        days=s.days,
        weight_class_gap=s.weight_class_gap,
        weight_teacher_gap=s.weight_teacher_gap,
        weight_late=s.weight_late,
        late_from_period=s.late_from_period,
        periods=[schemas.PeriodOut.model_validate(p) for p in load_periods(session)],
    )


@router.get("/settings", response_model=schemas.SettingsOut)
def read_settings(session: SessionDep):
    out = settings_out(session)
    session.commit()
    return out


@router.put("/settings", response_model=schemas.SettingsOut)
def update_settings(data: schemas.SettingsIn, session: SessionDep):
    s = get_settings(session)
    for field in (
        "school_name",
        "days",
        "weight_class_gap",
        "weight_teacher_gap",
        "weight_late",
        "late_from_period",
    ):
        setattr(s, field, getattr(data, field))
    session.execute(delete(models.Period))
    session.flush()
    session.add_all(models.Period(index=i, **p.model_dump()) for i, p in enumerate(data.periods))
    session.commit()
    return settings_out(session)


# ---- Einfache Stammdaten (gleiches Muster) ----


def crud(
    path: str,
    model: type[models.Base],
    schema_in: type[BaseModel],
    schema_out: type[BaseModel],
    order_by,
    label: str,
    validate=None,
) -> None:
    @router.get(f"/{path}", response_model=list[schema_out], name=f"list_{path}")
    def list_items(session: SessionDep) -> Sequence:
        return session.scalars(select(model).order_by(order_by)).all()

    @router.post(f"/{path}", response_model=schema_out, status_code=201, name=f"create_{path}")
    def create_item(data: schema_in, session: SessionDep):  # type: ignore[valid-type]
        if validate:
            validate(session, data)
        item = model(**data.model_dump())
        session.add(item)
        commit_or_409(session, label)
        return item

    @router.put(f"/{path}/{{item_id}}", response_model=schema_out, name=f"update_{path}")
    def update_item(item_id: int, data: schema_in, session: SessionDep):  # type: ignore[valid-type]
        item = session.get(model, item_id)
        if item is None:
            raise HTTPException(404, f"{label} nicht gefunden")
        if validate:
            validate(session, data)
        for k, v in data.model_dump().items():
            setattr(item, k, v)
        commit_or_409(session, label)
        return item

    @router.delete(f"/{path}/{{item_id}}", status_code=204, name=f"delete_{path}")
    def delete_item(item_id: int, session: SessionDep):
        item = session.get(model, item_id)
        if item is None:
            raise HTTPException(404, f"{label} nicht gefunden")
        session.delete(item)
        commit_or_409(session, label)
        return Response(status_code=204)


def _check_home_room(session: Session, data: schemas.ClassIn) -> None:
    if data.home_room_id is not None and session.get(models.Room, data.home_room_id) is None:
        raise HTTPException(422, "Stammraum existiert nicht")


crud("subjects", models.Subject, schemas.SubjectIn, schemas.SubjectOut, models.Subject.short, "Fach")
crud("teachers", models.Teacher, schemas.TeacherIn, schemas.TeacherOut, models.Teacher.short, "Lehrkraft")
crud("rooms", models.Room, schemas.RoomIn, schemas.RoomOut, models.Room.short, "Raum")
crud(
    "classes",
    models.SchoolClass,
    schemas.ClassIn,
    schemas.ClassOut,
    models.SchoolClass.name,
    "Klasse",
    validate=_check_home_room,
)


# ---- Unterricht (Lehrfächerverteilung) ----


def lesson_out(lesson: models.Lesson) -> schemas.LessonOut:
    return schemas.LessonOut(
        id=lesson.id,
        subject_id=lesson.subject_id,
        periods_per_week=lesson.periods_per_week,
        double_periods=lesson.double_periods,
        note=lesson.note,
        class_ids=[c.id for c in lesson.classes],
        teacher_ids=[t.id for t in lesson.teachers],
        room_ids=[r.id for r in lesson.rooms],
    )


def _fetch(session: Session, model, ids: list[int], label: str) -> list:
    ids = list(dict.fromkeys(ids))
    items = session.scalars(select(model).where(model.id.in_(ids))).all() if ids else []
    if len(items) != len(ids):
        raise HTTPException(422, f"Unbekannte {label}")
    return list(items)


def apply_lesson(session: Session, lesson: models.Lesson, data: schemas.LessonIn) -> None:
    if session.get(models.Subject, data.subject_id) is None:
        raise HTTPException(422, "Unbekanntes Fach")
    if data.double_periods * 2 > data.periods_per_week:
        raise HTTPException(422, "Mehr Doppelstunden als Wochenstunden")
    lesson.subject_id = data.subject_id
    lesson.periods_per_week = data.periods_per_week
    lesson.double_periods = data.double_periods
    lesson.note = data.note
    lesson.classes = _fetch(session, models.SchoolClass, data.class_ids, "Klasse")
    lesson.teachers = _fetch(session, models.Teacher, data.teacher_ids, "Lehrkraft")
    lesson.rooms = _fetch(session, models.Room, data.room_ids, "Raum")


@router.get("/lessons", response_model=list[schemas.LessonOut])
def list_lessons(session: SessionDep):
    return [lesson_out(lesson) for lesson in load_lessons(session)]


@router.post("/lessons", response_model=schemas.LessonOut, status_code=201)
def create_lesson(data: schemas.LessonIn, session: SessionDep):
    lesson = models.Lesson()
    apply_lesson(session, lesson, data)
    session.add(lesson)
    session.commit()
    return lesson_out(lesson)


@router.put("/lessons/{lesson_id}", response_model=schemas.LessonOut)
def update_lesson(lesson_id: int, data: schemas.LessonIn, session: SessionDep):
    lesson = session.get(models.Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, "Unterricht nicht gefunden")
    old_cards = sorted(lesson.card_lengths())
    apply_lesson(session, lesson, data)
    if sorted(lesson.card_lengths()) != old_cards:
        # Stundenzahl geändert: gesetzte Blöcke passen nicht mehr, aus allen Plänen entfernen
        session.execute(delete(models.Placement).where(models.Placement.lesson_id == lesson_id))
    session.commit()
    return lesson_out(lesson)


@router.delete("/lessons/{lesson_id}", status_code=204)
def delete_lesson(lesson_id: int, session: SessionDep):
    lesson = session.get(models.Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, "Unterricht nicht gefunden")
    session.delete(lesson)
    session.commit()
    return Response(status_code=204)
