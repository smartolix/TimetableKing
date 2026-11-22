from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Slot = list[int]  # [tag, stunde]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _check_slots(v: list[Slot]) -> list[Slot]:
    out = []
    for s in v:
        if len(s) != 2 or s[0] < 0 or s[1] < 0:
            raise ValueError("Zeitfenster müssen [Tag, Stunde] mit Werten ab 0 sein")
        if s not in out:
            out.append([int(s[0]), int(s[1])])
    return sorted(out)


# ---- Einstellungen und Zeitraster ----


class PeriodIn(BaseModel):
    label: str = ""
    start: str = ""
    end: str = ""
    break_after: bool = False


class PeriodOut(PeriodIn, ORM):
    id: int
    index: int


class SettingsIn(BaseModel):
    school_name: str = ""
    days: int = Field(5, ge=1, le=7)
    weight_class_gap: int = Field(20, ge=0, le=1000)
    weight_teacher_gap: int = Field(3, ge=0, le=1000)
    weight_late: int = Field(2, ge=0, le=1000)
    late_from_period: int = Field(6, ge=0, le=20)
    periods: list[PeriodIn] = Field(default_factory=list, max_length=16)


class SettingsOut(ORM):
    school_name: str
    days: int
    weight_class_gap: int
    weight_teacher_gap: int
    weight_late: int
    late_from_period: int
    periods: list[PeriodOut]


# ---- Stammdaten ----


class SubjectIn(BaseModel):
    short: str = Field(min_length=1, max_length=20)
    name: str = ""
    color: str = Field("#9aa5b1", pattern=r"^#[0-9a-fA-F]{6}$")


class SubjectOut(SubjectIn, ORM):
    id: int


class TeacherIn(BaseModel):
    short: str = Field(min_length=1, max_length=20)
    name: str = ""
    max_per_day: int | None = Field(None, ge=1, le=16)
    unavailable: list[Slot] = Field(default_factory=list)

    _slots = field_validator("unavailable")(_check_slots)


class TeacherOut(TeacherIn, ORM):
    id: int


class RoomIn(BaseModel):
    short: str = Field(min_length=1, max_length=20)
    name: str = ""
    capacity: int | None = Field(None, ge=1)
    unavailable: list[Slot] = Field(default_factory=list)

    _slots = field_validator("unavailable")(_check_slots)


class RoomOut(RoomIn, ORM):
    id: int


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    home_room_id: int | None = None
    unavailable: list[Slot] = Field(default_factory=list)

    _slots = field_validator("unavailable")(_check_slots)


class ClassOut(ClassIn, ORM):
    id: int


class LessonIn(BaseModel):
    subject_id: int
    class_ids: list[int] = Field(min_length=1)
    teacher_ids: list[int] = Field(default_factory=list)
    room_ids: list[int] = Field(default_factory=list)
    periods_per_week: int = Field(1, ge=1, le=40)
    double_periods: int = Field(0, ge=0, le=20)
    note: str = ""


class LessonOut(ORM):
    id: int
    subject_id: int
    class_ids: list[int]
    teacher_ids: list[int]
    room_ids: list[int]
    periods_per_week: int
    double_periods: int
    note: str


# ---- Pläne ----


class TimetableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    time_limit: int | None = Field(None, ge=1, le=3600)
    relax: bool = False


class TimetableRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SolveRequest(BaseModel):
    time_limit: int | None = Field(None, ge=1, le=3600)
    keep_locked: bool = True
    relax: bool = False


class PlacementOut(ORM):
    id: int
    lesson_id: int
    day: int
    period: int
    length: int
    room_id: int | None
    locked: bool


class TimetableSummary(ORM):
    id: int
    name: str
    status: str
    message: str
    score: float | None
    solve_seconds: float | None
    created_at: datetime
    updated_at: datetime


class ReportEntry(BaseModel):
    constraint_id: int
    violations: int


class TimetableOut(TimetableSummary):
    placements: list[PlacementOut]
    report: list[ReportEntry] = Field(default_factory=list)


class PlacementUpdate(BaseModel):
    day: int | None = Field(None, ge=0)
    period: int | None = Field(None, ge=0)
    room_id: int | None = None
    # room_id explizit auf null setzen: clear_room=true
    clear_room: bool = False
    locked: bool | None = None
    force: bool = False


class SwapRequest(BaseModel):
    a: int
    b: int
    force: bool = False


class Conflict(BaseModel):
    kind: str  # teacher | class | room | unavailable | outside | break
    message: str
    placement_ids: list[int]
    day: int
    period: int


class ImportResult(BaseModel):
    counts: dict[str, int]


# ---- Bedingungen ----

Importance = Literal["off", "low", "normal", "high", "must"]


class ConstraintIn(BaseModel):
    type: str
    importance: Importance = "normal"
    active: bool = True
    params: dict = Field(default_factory=dict)
    note: str = Field("", max_length=200)


class ConstraintOut(ConstraintIn, ORM):
    id: int
    position: int
