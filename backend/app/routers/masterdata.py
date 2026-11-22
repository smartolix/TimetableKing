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
from app.services.problem import get_settings, load_classes, load_lessons, load_periods

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
        weight_undesired=s.weight_undesired,
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
        "weight_undesired",
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


# ---- Klassen mit Teilungen und Gruppen ----


def class_out(c: models.SchoolClass) -> schemas.ClassOut:
    return schemas.ClassOut(
        id=c.id,
        name=c.name,
        home_room_id=c.home_room_id,
        unavailable=c.unavailable or [],
        undesired=c.undesired or [],
        divisions=[
            schemas.DivisionIO(
                id=d.id, name=d.name, groups=[schemas.GroupIO(id=g.id, name=g.name) for g in d.groups]
            )
            for d in c.divisions
        ],
    )


def apply_class(session: Session, c: models.SchoolClass, data: schemas.ClassIn) -> None:
    _check_home_room(session, data)
    c.name, c.home_room_id = data.name, data.home_room_id
    c.unavailable, c.undesired = data.unavailable, data.undesired
    old_div = {d.id: d for d in c.divisions}
    old_groups = {g.id: g for d in c.divisions for g in d.groups}
    divisions = []
    for i, d_in in enumerate(data.divisions):
        names = [g.name.strip() for g in d_in.groups]
        if len(set(names)) != len(names):
            raise HTTPException(422, f"Teilung „{d_in.name}“: Gruppennamen müssen verschieden sein")
        div = old_div.get(d_in.id) if d_in.id else None
        if d_in.id and div is None:
            raise HTTPException(422, "Teilung gehört nicht zu dieser Klasse")
        div = div or models.Division()
        div.name, div.position = d_in.name, i
        groups = []
        for j, g_in in enumerate(d_in.groups):
            g = old_groups.get(g_in.id) if g_in.id else None
            if g_in.id and g is None:
                raise HTTPException(422, "Gruppe gehört nicht zu dieser Klasse")
            g = g or models.Group()
            g.name, g.position = g_in.name.strip(), j
            groups.append(g)
        div.groups = groups
        divisions.append(div)
    c.divisions = divisions


def _load_class(session: Session, class_id: int) -> models.SchoolClass:
    c = next((x for x in load_classes(session) if x.id == class_id), None)
    if c is None:
        raise HTTPException(404, "Klasse nicht gefunden")
    return c


@router.get("/classes", response_model=list[schemas.ClassOut])
def list_classes(session: SessionDep):
    return [class_out(c) for c in load_classes(session)]


@router.post("/classes", response_model=schemas.ClassOut, status_code=201)
def create_class(data: schemas.ClassIn, session: SessionDep):
    c = models.SchoolClass(divisions=[])
    apply_class(session, c, data)
    session.add(c)
    commit_or_409(session, "Klasse")
    return class_out(c)


@router.put("/classes/{class_id}", response_model=schemas.ClassOut)
def update_class(class_id: int, data: schemas.ClassIn, session: SessionDep):
    c = _load_class(session, class_id)
    apply_class(session, c, data)
    commit_or_409(session, "Klasse")
    return class_out(_load_class(session, class_id))


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: int, session: SessionDep):
    session.delete(_load_class(session, class_id))
    commit_or_409(session, "Klasse")
    return Response(status_code=204)


# ---- Unterricht (Lehrfächerverteilung) ----


def lesson_out(lesson: models.Lesson) -> schemas.LessonOut:
    return schemas.LessonOut(
        id=lesson.id,
        periods_per_week=lesson.periods_per_week,
        double_periods=lesson.double_periods,
        note=lesson.note,
        parts=[
            schemas.PartIO(
                id=p.id,
                subject_id=p.subject_id,
                teacher_ids=[t.id for t in p.teachers],
                class_ids=[c.id for c in p.classes],
                group_ids=[g.id for g in p.groups],
                room_ids=[r.id for r in p.rooms],
            )
            for p in lesson.parts
        ],
    )


def _fetch(session: Session, model, ids: list[int], label: str) -> list:
    ids = list(dict.fromkeys(ids))
    items = session.scalars(select(model).where(model.id.in_(ids))).all() if ids else []
    if len(items) != len(ids):
        raise HTTPException(422, f"Unbekannte {label}")
    by_id = {i.id: i for i in items}
    return [by_id[i] for i in ids]


def apply_lesson(session: Session, lesson: models.Lesson, data: schemas.LessonIn) -> None:
    if data.double_periods * 2 > data.periods_per_week:
        raise HTTPException(422, "Mehr Doppelstunden als Wochenstunden")
    lesson.periods_per_week = data.periods_per_week
    lesson.double_periods = data.double_periods
    lesson.note = data.note
    old = {p.id: p for p in lesson.parts}
    parts = []
    for i, p_in in enumerate(data.parts):
        if session.get(models.Subject, p_in.subject_id) is None:
            raise HTTPException(422, f"Zeile {i + 1}: unbekanntes Fach")
        if not p_in.class_ids and not p_in.group_ids:
            raise HTTPException(422, f"Zeile {i + 1}: mindestens eine Klasse oder Gruppe wählen")
        part = old.get(p_in.id) if p_in.id else None
        part = part or models.LessonPart()
        part.subject_id, part.position = p_in.subject_id, i
        part.teachers = _fetch(session, models.Teacher, p_in.teacher_ids, "Lehrkraft")
        part.classes = _fetch(session, models.SchoolClass, p_in.class_ids, "Klasse")
        part.groups = _fetch(session, models.Group, p_in.group_ids, "Gruppe")
        part.rooms = _fetch(session, models.Room, p_in.room_ids, "Raum")
        # Gruppe einer Klasse, die schon ganz dabei ist, ist überflüssig
        whole = {c.id for c in part.classes}
        part.groups = [g for g in part.groups if g.division.class_id not in whole]
        parts.append(part)
    lesson.parts = parts


@router.get("/lessons", response_model=list[schemas.LessonOut])
def list_lessons(session: SessionDep):
    return [lesson_out(lesson) for lesson in load_lessons(session)]


@router.post("/lessons", response_model=schemas.LessonOut, status_code=201)
def create_lesson(data: schemas.LessonIn, session: SessionDep):
    lesson = models.Lesson(parts=[])
    apply_lesson(session, lesson, data)
    session.add(lesson)
    session.commit()
    return lesson_out(lesson)


@router.put("/lessons/{lesson_id}", response_model=schemas.LessonOut)
def update_lesson(lesson_id: int, data: schemas.LessonIn, session: SessionDep):
    lesson = next((x for x in load_lessons(session) if x.id == lesson_id), None)
    if lesson is None:
        raise HTTPException(404, "Unterricht nicht gefunden")
    old_cards = sorted(lesson.card_lengths())
    old_parts = {p.id for p in lesson.parts}
    apply_lesson(session, lesson, data)
    session.flush()
    if sorted(lesson.card_lengths()) != old_cards:
        # Stundenzahl geändert: gesetzte Blöcke passen nicht mehr, aus allen Plänen entfernen
        session.execute(delete(models.Placement).where(models.Placement.lesson_id == lesson_id))
    elif old_parts - {p.id for p in lesson.parts}:
        # Entfernte Zeilen: deren Räume aus den Plänen löschen
        keep = {str(p.id) for p in lesson.parts}
        for pl in session.scalars(select(models.Placement).where(models.Placement.lesson_id == lesson_id)):
            pl.rooms = {k: v for k, v in (pl.rooms or {}).items() if k in keep}
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
