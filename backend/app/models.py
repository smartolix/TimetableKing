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
    max_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unavailable: Mapped[SlotList] = mapped_column(JSON, default=list)


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

    home_room: Mapped[Room | None] = relationship()


lesson_classes = Table(
    "lesson_classes",
    Base.metadata,
    Column("lesson_id", ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True),
    Column("class_id", ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
)
lesson_teachers = Table(
    "lesson_teachers",
    Base.metadata,
    Column("lesson_id", ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True),
    Column("teacher_id", ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True),
)
lesson_rooms = Table(
    "lesson_rooms",
    Base.metadata,
    Column("lesson_id", ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True),
    Column("room_id", ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True),
)


class Lesson(Base):
    """Eine Zeile der Lehrfächerverteilung: wer unterrichtet welches Fach in welcher Klasse wie oft.

    Mehrere Klassen = Klassen werden gemeinsam unterrichtet.
    Mehrere Lehrkräfte = Teamteaching (alle sind gleichzeitig gebunden).
    Räume = erlaubte Räume (einer davon wird gewählt). Leer = Stammraum der (ersten) Klasse.
    """

    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"))
    periods_per_week: Mapped[int] = mapped_column(Integer, default=1)
    double_periods: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(200), default="")

    subject: Mapped[Subject] = relationship()
    classes: Mapped[list[SchoolClass]] = relationship(secondary=lesson_classes, order_by="SchoolClass.name")
    teachers: Mapped[list[Teacher]] = relationship(secondary=lesson_teachers, order_by="Teacher.short")
    rooms: Mapped[list[Room]] = relationship(secondary=lesson_rooms, order_by="Room.short")

    def card_lengths(self) -> list[int]:
        """Zerlegt die Wochenstunden in Blöcke: zuerst Doppelstunden, dann Einzelstunden."""
        doubles = max(0, min(self.double_periods, self.periods_per_week // 2))
        singles = max(0, self.periods_per_week - 2 * doubles)
        return [2] * doubles + [1] * singles


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
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    timetable: Mapped[Timetable] = relationship(back_populates="placements")
    lesson: Mapped[Lesson] = relationship()
