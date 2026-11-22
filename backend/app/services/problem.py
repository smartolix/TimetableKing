"""Baut aus den Stammdaten das Rechenproblem für den Solver."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.constraint_catalog import IMPORTANCE, validate_params
from app.solver.cpsat import ConstraintSpec, FixedCard, LessonSpec, Problem, Weights


def get_settings(session: Session) -> models.SchoolSettings:
    s = session.get(models.SchoolSettings, 1)
    if s is None:
        s = models.SchoolSettings(id=1)
        session.add(s)
        session.flush()
    return s


def load_periods(session: Session) -> list[models.Period]:
    return list(session.scalars(select(models.Period).order_by(models.Period.index)))


def load_lessons(session: Session) -> list[models.Lesson]:
    return list(
        session.scalars(
            select(models.Lesson)
            .options(
                selectinload(models.Lesson.subject),
                selectinload(models.Lesson.classes).selectinload(models.SchoolClass.home_room),
                selectinload(models.Lesson.teachers),
                selectinload(models.Lesson.rooms),
            )
            .order_by(models.Lesson.id)
        )
    )


def lesson_label(lesson: models.Lesson) -> str:
    classes = "+".join(c.name for c in lesson.classes) or "?"
    teachers = "/".join(t.short for t in lesson.teachers)
    return f"{lesson.subject.short} {classes}" + (f" ({teachers})" if teachers else "")


def room_options(lesson: models.Lesson) -> list[int]:
    if lesson.rooms:
        return [r.id for r in lesson.rooms]
    for c in lesson.classes:
        if c.home_room_id is not None:
            return [c.home_room_id]
    return []


def _slots(raw, n_days: int, n_periods: int) -> set[tuple[int, int]]:
    return {(d, p) for d, p in raw or [] if d < n_days and p < n_periods}


def build_problem(session: Session, fixed: list[models.Placement] | None = None) -> Problem:
    settings = get_settings(session)
    periods = load_periods(session)
    n_days, n_periods = settings.days, len(periods)
    lessons = load_lessons(session)
    teachers = list(session.scalars(select(models.Teacher)))
    classes = list(session.scalars(select(models.SchoolClass)))
    rooms = list(session.scalars(select(models.Room)))
    return Problem(
        n_days=n_days,
        n_periods=n_periods,
        lessons=[
            LessonSpec(
                id=lesson.id,
                label=lesson_label(lesson),
                class_ids=[c.id for c in lesson.classes],
                teacher_ids=[t.id for t in lesson.teachers],
                room_options=room_options(lesson),
                cards=lesson.card_lengths(),
                subject_id=lesson.subject_id,
            )
            for lesson in lessons
        ],
        break_after={p.index for p in periods if p.break_after},
        teacher_unavailable={t.id: _slots(t.unavailable, n_days, n_periods) for t in teachers},
        class_unavailable={c.id: _slots(c.unavailable, n_days, n_periods) for c in classes},
        room_unavailable={r.id: _slots(r.unavailable, n_days, n_periods) for r in rooms},
        teacher_max_per_day={t.id: t.max_per_day for t in teachers if t.max_per_day},
        fixed=[FixedCard(f.lesson_id, f.day, f.period, f.length, f.room_id) for f in fixed or []],
        constraints=load_constraint_specs(session, n_days, n_periods),
        teacher_names={t.id: t.short for t in teachers},
        class_names={c.id: c.name for c in classes},
        weights=Weights(
            class_gap=settings.weight_class_gap,
            teacher_gap=settings.weight_teacher_gap,
            late=settings.weight_late,
            late_from=settings.late_from_period,
        ),
    )


def known_ids(session: Session) -> dict[str, set[int]]:
    return {
        "teachers": set(session.scalars(select(models.Teacher.id))),
        "classes": set(session.scalars(select(models.SchoolClass.id))),
        "subjects": set(session.scalars(select(models.Subject.id))),
        "rooms": set(session.scalars(select(models.Room.id))),
    }


def load_constraint_specs(session: Session, n_days: int, n_periods: int) -> list[ConstraintSpec]:
    """Aktive Bedingungen für den Solver. Verweise auf gelöschte Einträge werden ignoriert."""
    known = known_ids(session)
    out = []
    for c in session.scalars(
        select(models.Constraint).order_by(models.Constraint.position, models.Constraint.id)
    ):
        if not c.active or c.importance == "off":
            continue
        params = dict(c.params or {})
        for key, kind in (
            ("teacher_ids", "teachers"),
            ("class_ids", "classes"),
            ("subject_ids", "subjects"),
            ("room_ids", "rooms"),
        ):
            if key in params:
                params[key] = [i for i in params[key] if i in known[kind]]
        try:
            params = validate_params(c.type, params, n_days, n_periods, known)
        except ValueError:
            continue  # z. B. Fach gelöscht: Bedingung ist nicht mehr anwendbar
        out.append(ConstraintSpec(c.id, c.type, params, IMPORTANCE[c.importance], c.note))
    return out
