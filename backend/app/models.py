"""Datenmodell: Stammdaten (Zeitraster, Fächer, Lehrkräfte, Räume, Klassen, Unterricht) und Pläne."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# Ein Zeitfenster wird als [tag, stunde] gespeichert (beide 0-basiert).
SlotList = list[list[int]]


class SchoolSettings(Base):
    """Eine Zeile (id=1) mit den Grundeinstellungen der Schule."""

    __tablename__ = "school_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    school_name: Mapped[str] = mapped_column(String(200), default="")
    days: Mapped[int] = mapped_column(Integer, default=5)
    # Gewichte der weichen Regeln für den Solver
    weight_class_gap: Mapped[int] = mapped_column(Integer, default=20)
    weight_teacher_gap: Mapped[int] = mapped_column(Integer, default=3)
    weight_late: Mapped[int] = mapped_column(Integer, default=2)
    weight_undesired: Mapped[int] = mapped_column(Integer, default=10)
    late_from_period: Mapped[int] = mapped_column(Integer, default=6)


class Period(Base):
    """Eine Unterrichtsstunde im Tagesraster."""

    __tablename__ = "periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    index: Mapped[int] = mapped_column(Integer, unique=True)
    label: Mapped[str] = mapped_column(String(40), default="")
    start: Mapped[str] = mapped_column(String(5), default="")  # "08:00"
    end: Mapped[str] = mapped_column(String(5), default="")
    # Nach dieser Stunde ist eine (große) Pause: Doppelstunden dürfen nicht darüber gehen.
    break_after: Mapped[bool] = mapped_column(Boolean, default=False)


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    short: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    color: Mapped[str] = mapped_column(String(9), default="#9aa5b1")


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(primary_key=True)
    short: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    # Soll-Stunden pro Woche (Lehrverpflichtung), nur zur Anzeige Soll/Ist
    target_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unavailable: Mapped[SlotList] = mapped_column(JSON, default=list)
    # Unerwünschte Zeiten: möglich, aber mit Strafpunkten
    undesired: Mapped[SlotList] = mapped_column(JSON, default=list)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    short: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unavailable: Mapped[SlotList] = mapped_column(JSON, default=list)


class SchoolClass(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    home_room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    unavailable: Mapped[SlotList] = mapped_column(JSON, default=list)
    undesired: Mapped[SlotList] = mapped_column(JSON, default=list)

    home_room: Mapped[Room | None] = relationship()
    divisions: Mapped[list["Division"]] = relationship(
        back_populates="school_class", cascade="all, delete-orphan", order_by="Division.position"
    )


class Division(Base):
    """Eine Teilung einer Klasse, z. B. „Religion“ mit den Gruppen RK und EV.

    Gruppen derselben Teilung schließen sich aus; Gruppen verschiedener Teilungen überschneiden sich
    (ein Schüler ist z. B. in „RK“ und in „G1“).
    """

    __tablename__ = "divisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    school_class: Mapped[SchoolClass] = relationship(back_populates="divisions")
    groups: Mapped[list["Group"]] = relationship(
        back_populates="division", cascade="all, delete-orphan", order_by="Group.position"
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    division_id: Mapped[int] = mapped_column(ForeignKey("divisions.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=0)

    division: Mapped[Division] = relationship(back_populates="groups")


part_teachers = Table(
    "part_teachers",
    Base.metadata,
    Column("part_id", ForeignKey("lesson_parts.id", ondelete="CASCADE"), primary_key=True),
    Column("teacher_id", ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True),
)
part_classes = Table(
    "part_classes",
    Base.metadata,
    Column("part_id", ForeignKey("lesson_parts.id", ondelete="CASCADE"), primary_key=True),
    Column("class_id", ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
)
part_groups = Table(
    "part_groups",
    Base.metadata,
    Column("part_id", ForeignKey("lesson_parts.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
)
part_rooms = Table(
    "part_rooms",
    Base.metadata,
    Column("part_id", ForeignKey("lesson_parts.id", ondelete="CASCADE"), primary_key=True),
    Column("room_id", ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True),
)


class Lesson(Base):
    """Ein Unterricht der Lehrfächerverteilung mit Wochenstunden.

    Ein Unterricht besteht aus einer oder mehreren Zeilen (`LessonPart`), die immer gleichzeitig stattfinden:
    - eine Zeile mit mehreren Lehrkräften = Teamteaching
    - mehrere Zeilen = Kopplung, z. B. Religion RK und EV parallel in verschiedenen Räumen
    """

    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    periods_per_week: Mapped[int] = mapped_column(Integer, default=1)
    double_periods: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(200), default="")

    parts: Mapped[list["LessonPart"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="LessonPart.position"
    )

    def card_lengths(self) -> list[int]:
        """Zerlegt die Wochenstunden in Blöcke: zuerst Doppelstunden, dann Einzelstunden."""
        doubles = max(0, min(self.double_periods, self.periods_per_week // 2))
        singles = max(0, self.periods_per_week - 2 * doubles)
        return [2] * doubles + [1] * singles

    @property
    def teachers(self) -> list[Teacher]:
        seen: dict[int, Teacher] = {}
        for part in self.parts:
            for t in part.teachers:
                seen.setdefault(t.id, t)
        return list(seen.values())

    @property
    def classes(self) -> list[SchoolClass]:
        """Alle Klassen, die ganz oder mit einer Gruppe beteiligt sind."""
        seen: dict[int, SchoolClass] = {}
        for part in self.parts:
            for c in part.all_classes:
                seen.setdefault(c.id, c)
        return sorted(seen.values(), key=lambda c: c.name)

    @property
    def subjects(self) -> list[Subject]:
        seen: dict[int, Subject] = {}
        for part in self.parts:
            seen.setdefault(part.subject.id, part.subject)
        return list(seen.values())


class LessonPart(Base):
    """Eine Zeile eines Unterrichts: Fach, Lehrkräfte, Schüler (ganze Klassen und/oder Gruppen), Räume."""

    __tablename__ = "lesson_parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column(Integer, default=0)

    lesson: Mapped[Lesson] = relationship(back_populates="parts")
    subject: Mapped[Subject] = relationship()
    teachers: Mapped[list[Teacher]] = relationship(secondary=part_teachers, order_by="Teacher.short")
    classes: Mapped[list[SchoolClass]] = relationship(secondary=part_classes, order_by="SchoolClass.name")
    groups: Mapped[list[Group]] = relationship(secondary=part_groups)
    # Erlaubte Räume; einer davon wird gewählt. Leer = Stammraum der (ersten) Klasse.
    rooms: Mapped[list[Room]] = relationship(secondary=part_rooms, order_by="Room.short")

    @property
    def all_classes(self) -> list[SchoolClass]:
        seen = {c.id: c for c in self.classes}
        for g in self.groups:
            seen.setdefault(g.division.school_class.id, g.division.school_class)
        return list(seen.values())


class Constraint(Base):
    """Eine Bedingung aus dem Katalog (app/constraint_catalog.py) mit Parametern und Wichtigkeit."""

    __tablename__ = "constraints"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(60))
    # off | low | normal | high | must
    importance: Mapped[str] = mapped_column(String(10), default="normal")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str] = mapped_column(String(200), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)


def _now() -> datetime:
    return datetime.now(UTC)


class Timetable(Base):
    __tablename__ = "timetables"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # draft | queued | running | done | failed
    status: Mapped[str] = mapped_column(String(20), default="draft")
    message: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    solve_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Ergebnis der Bedingungsprüfung: [{constraint_id, violations}]
    report: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    placements: Mapped[list["Placement"]] = relationship(
        back_populates="timetable", cascade="all, delete-orphan", passive_deletes=True
    )


class Placement(Base):
    """Ein gesetzter Block (Einzel- oder Doppelstunde) einer Unterrichtseinheit im Plan."""

    __tablename__ = "placements"

    id: Mapped[int] = mapped_column(primary_key=True)
    timetable_id: Mapped[int] = mapped_column(ForeignKey("timetables.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    day: Mapped[int] = mapped_column(Integer)
    period: Mapped[int] = mapped_column(Integer)
    length: Mapped[int] = mapped_column(Integer, default=1)
    # Gewählter Raum je Zeile des Unterrichts: {"<part_id>": room_id}
    rooms: Mapped[dict] = mapped_column(JSON, default=dict)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    timetable: Mapped[Timetable] = relationship(back_populates="placements")
    lesson: Mapped[Lesson] = relationship()
