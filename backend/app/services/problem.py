"""Baut aus den Stammdaten das Rechenproblem für den Solver."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.constraint_catalog import IMPORTANCE, validate_params
from app.services.groups import build_atoms
from app.solver.cpsat import ConstraintSpec, FixedCard, LessonSpec, PartSpec, Problem, Weights


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
    part = selectinload(models.Lesson.parts)
    return list(
        session.scalars(
            select(models.Lesson)
            .options(
                part.selectinload(models.LessonPart.subject),
                part.selectinload(models.LessonPart.classes).selectinload(models.SchoolClass.home_room),
                part.selectinload(models.LessonPart.groups)
                .selectinload(models.Group.division)
                .selectinload(models.Division.school_class)
                .selectinload(models.SchoolClass.home_room),
                part.selectinload(models.LessonPart.teachers),
                part.selectinload(models.LessonPart.rooms),
            )
            .order_by(models.Lesson.id)
        )
    )


def load_classes(session: Session) -> list[models.SchoolClass]:
    return list(
        session.scalars(
            select(models.SchoolClass)
            .options(selectinload(models.SchoolClass.divisions).selectinload(models.Division.groups))
            .order_by(models.SchoolClass.name)
        )
    )


def part_label(part: models.LessonPart) -> str:
    who = [c.name for c in part.classes] + [f"{g.division.school_class.name}:{g.name}" for g in part.groups]
    return f"{part.subject.short} {'+'.join(who) or '?'}"


def lesson_label(lesson: models.Lesson) -> str:
    if not lesson.parts:
        return f"Unterricht #{lesson.id}"
    teachers = "/".join(t.short for t in lesson.teachers)
    return " | ".join(part_label(p) for p in lesson.parts) + (f" ({teachers})" if teachers else "")


def part_room_options(part: models.LessonPart) -> list[int]:
    """Erlaubte Räume einer Zeile; ohne Angabe der Stammraum der (ersten) Klasse."""
    if part.rooms:
        return [r.id for r in part.rooms]
    for c in part.all_classes:
        if c.home_room_id is not None:
            return [c.home_room_id]
    return []


def _slots(raw, n_days: int, n_periods: int) -> set[tuple[int, int]]:
    return {(d, p) for d, p in raw or [] if d < n_days and p < n_periods}


def build_problem(session: Session, fixed: list[models.Placement] | None = None) -> Problem:
    settings = get_settings(session)
    periods = load_periods(session)
    n_days, n_periods = settings.days, len(periods)
    lessons = [lesson for lesson in load_lessons(session) if lesson.parts]
    teachers = list(session.scalars(select(models.Teacher)))
    classes = load_classes(session)
    rooms = list(session.scalars(select(models.Room)))
    atoms = build_atoms(classes)
    class_by_id = {c.id: c for c in classes}

    def per_atom(attr: str) -> dict[int, set[tuple[int, int]]]:
        return {
            a: _slots(getattr(class_by_id[cid], attr), n_days, n_periods)
            for a, (cid, _g) in atoms.atoms.items()
        }

    return Problem(
        n_days=n_days,
        n_periods=n_periods,
        lessons=[
            LessonSpec(
                id=lesson.id,
                label=lesson_label(lesson),
                class_ids=[],
                teacher_ids=[],
                room_options=[],
                cards=lesson.card_lengths(),
                parts=[
                    PartSpec(
                        id=part.id,
                        subject_id=part.subject_id,
                        teacher_ids=[t.id for t in part.teachers],
                        class_ids=atoms.for_part(part),
                        room_options=part_room_options(part),
                    )
                    for part in lesson.parts
                ],
            )
            for lesson in lessons
        ],
        break_after={p.index for p in periods if p.break_after},
        teacher_unavailable={t.id: _slots(t.unavailable, n_days, n_periods) for t in teachers},
        teacher_undesired={t.id: _slots(t.undesired, n_days, n_periods) for t in teachers},
        class_unavailable=per_atom("unavailable"),
        class_undesired=per_atom("undesired"),
        class_atoms=atoms.class_atoms,
        room_unavailable={r.id: _slots(r.unavailable, n_days, n_periods) for r in rooms},
        teacher_max_per_day={t.id: t.max_per_day for t in teachers if t.max_per_day},
        fixed=[
            FixedCard(f.lesson_id, f.day, f.period, f.length, {int(k): v for k, v in (f.rooms or {}).items()})
            for f in fixed or []
        ],
        constraints=load_constraint_specs(session, n_days, n_periods),
        teacher_names={t.id: t.short for t in teachers},
        class_names=dict(atoms.labels),
        weights=Weights(
            class_gap=settings.weight_class_gap,
            teacher_gap=settings.weight_teacher_gap,
            late=settings.weight_late,
            late_from=settings.late_from_period,
            undesired=settings.weight_undesired,
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
