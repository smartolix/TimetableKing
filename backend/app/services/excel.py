"""Excel-Import und -Export der Stammdaten.

Die Arbeitsmappe hat je ein Blatt für Zeitraster, Fächer, Lehrkräfte, Räume, Klassen und Unterricht.
Verweise laufen über Kürzel (Fach, Lehrkraft, Raum) bzw. den Klassennamen.
Sperrzeiten werden als Text geschrieben, z. B. "Mo1-2, Fr" (Fr = ganzer Tag).
"""

import io
import re
from dataclasses import dataclass, field

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import models
from app.services.problem import get_settings, load_lessons, load_periods

DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

SHEETS: dict[str, list[str]] = {
    "Zeitraster": ["Bezeichnung", "Beginn", "Ende", "Pause danach"],
    "Fächer": ["Kürzel", "Name", "Farbe"],
    "Lehrkräfte": ["Kürzel", "Name", "Max. Stunden/Tag", "Gesperrt"],
    "Räume": ["Kürzel", "Name", "Plätze", "Gesperrt"],
    "Klassen": ["Name", "Stammraum", "Gesperrt"],
    "Unterricht": ["Klassen", "Fach", "Lehrkräfte", "Stunden/Woche", "Doppelstunden", "Räume", "Notiz"],
}


class ImportError_(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


# ---- Sperrzeiten als Text ----

_SLOT_RE = re.compile(r"^(mo|di|mi|do|fr|sa|so)\s*(?:(\d+)\s*(?:-\s*(\d+))?)?$", re.IGNORECASE)


def parse_slots(text: str | None, n_periods: int) -> list[list[int]]:
    """ "Mo1-2, Fr" -> [[0,0],[0,1],[4,0],...]. Stunden sind im Text 1-basiert."""
    out: set[tuple[int, int]] = set()
    for part in re.split(r"[,;]", str(text or "")):
        part = part.strip()
        if not part:
            continue
        m = _SLOT_RE.match(part)
        if not m:
            raise ValueError(f"'{part}' ist keine gültige Zeitangabe (Beispiel: Mo1-2, Fr)")
        day = [d.lower() for d in DAYS].index(m.group(1).lower())
        if m.group(2) is None:
            first, last = 1, n_periods
        else:
            first = int(m.group(2))
            last = int(m.group(3) or first)
        if first < 1 or last < first:
            raise ValueError(f"'{part}': ungültiger Stundenbereich")
        out.update((day, p - 1) for p in range(first, last + 1))
    return [list(s) for s in sorted(out)]


def format_slots(slots: list[list[int]] | None) -> str:
    by_day: dict[int, list[int]] = {}
    for d, p in slots or []:
        by_day.setdefault(d, []).append(p)
    parts = []
    for d in sorted(by_day):
        ps = sorted(by_day[d])
        runs, start, prev = [], ps[0], ps[0]
        for p in ps[1:] + [None]:
            if p is not None and p == prev + 1:
                prev = p
                continue
            runs.append((start, prev))
            if p is not None:
                start = prev = p
        for a, b in runs:
            parts.append(f"{DAYS[d]}{a + 1}" + (f"-{b + 1}" if b != a else ""))
    return ", ".join(parts)


def _split(value) -> list[str]:
    return [v.strip() for v in re.split(r"[,;+/]", str(value or "")) if v.strip()]


# ---- Export / Vorlage ----


def _header(ws: Worksheet, columns: list[str]) -> None:
    ws.append(columns)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="E8ECF1")
    for i, col in enumerate(columns):
        ws.column_dimensions[chr(65 + i)].width = max(12, len(col) + 4)
    ws.freeze_panes = "A2"


def export_workbook(session: Session | None) -> bytes:
    """Ohne Session: leere Vorlage mit Beispielzeilen."""
    wb = Workbook()
    wb.remove(wb.active)
    sheets = {name: wb.create_sheet(name) for name in SHEETS}
    for name, ws in sheets.items():
        _header(ws, SHEETS[name])

    if session is None:
        sheets["Zeitraster"].append(["1.", "08:00", "08:50", "nein"])
        sheets["Zeitraster"].append(["2.", "08:50", "09:40", "ja"])
        sheets["Fächer"].append(["M", "Mathematik", "#4f7cff"])
        sheets["Lehrkräfte"].append(["HUB", "Huber Anna", 6, "Fr5-8"])
        sheets["Räume"].append(["R101", "Klassenzimmer 1a", 28, ""])
        sheets["Klassen"].append(["1a", "R101", ""])
        sheets["Unterricht"].append(["1a", "M", "HUB", 4, 0, "", ""])
    else:
        for p in load_periods(session):
            sheets["Zeitraster"].append([p.label, p.start, p.end, "ja" if p.break_after else "nein"])
        for s in session.scalars(select(models.Subject).order_by(models.Subject.short)):
            sheets["Fächer"].append([s.short, s.name, s.color])
        for t in session.scalars(select(models.Teacher).order_by(models.Teacher.short)):
            sheets["Lehrkräfte"].append([t.short, t.name, t.max_per_day, format_slots(t.unavailable)])
        for r in session.scalars(select(models.Room).order_by(models.Room.short)):
            sheets["Räume"].append([r.short, r.name, r.capacity, format_slots(r.unavailable)])
        for c in session.scalars(select(models.SchoolClass).order_by(models.SchoolClass.name)):
            sheets["Klassen"].append(
                [c.name, c.home_room.short if c.home_room else "", format_slots(c.unavailable)]
            )
        for lesson in load_lessons(session):
            sheets["Unterricht"].append(
                [
                    ", ".join(c.name for c in lesson.classes),
                    lesson.subject.short,
                    ", ".join(t.short for t in lesson.teachers),
                    lesson.periods_per_week,
                    lesson.double_periods,
                    ", ".join(r.short for r in lesson.rooms),
                    lesson.note,
                ]
            )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---- Import ----


@dataclass
class _Rows:
    errors: list[str] = field(default_factory=list)

    def read(self, wb, name: str) -> list[tuple[int, dict]]:
        if name not in wb.sheetnames:
            return []
        ws = wb[name]
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        header = [str(h or "").strip() for h in rows[0]]
        missing = [c for c in SHEETS[name][:1] if c not in header]
        if missing:
            self.errors.append(f"Blatt '{name}': Spalte '{missing[0]}' fehlt")
            return []
        out = []
        for i, row in enumerate(rows[1:], start=2):
            if all(v is None or str(v).strip() == "" for v in row):
                continue
            out.append((i, {h: v for h, v in zip(header, row, strict=False) if h}))
        return out


def _text(v) -> str:
    return "" if v is None else str(v).strip()


def _int(v, default: int | None = None) -> int | None:
    if v is None or str(v).strip() == "":
        return default
    return int(float(str(v).replace(",", ".")))


def _yes(v) -> bool:
    return _text(v).lower() in ("ja", "j", "x", "yes", "1", "true", "wahr")


def import_workbook(session: Session, content: bytes) -> dict[str, int]:
    """Ersetzt alle Stammdaten und Pläne durch den Inhalt der Arbeitsmappe (alles oder nichts)."""
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ImportError_(["Die Datei ist keine gültige Excel-Datei (.xlsx)."]) from exc
    r = _Rows()
    data = {name: r.read(wb, name) for name in SHEETS}
    errors = r.errors

    periods = []
    for _, row in data["Zeitraster"]:
        periods.append(
            models.Period(
                index=len(periods),
                label=_text(row.get("Bezeichnung")) or f"{len(periods) + 1}.",
                start=_text(row.get("Beginn"))[:5],
                end=_text(row.get("Ende"))[:5],
                break_after=_yes(row.get("Pause danach")),
            )
        )
    n_periods = len(periods) or len(load_periods(session)) or 8

    def unique(kind: str, key: str, rows) -> dict[str, tuple[int, dict]]:
        out: dict[str, tuple[int, dict]] = {}
        for row_no, row in rows:
            k = _text(row.get(key))
            if not k:
                errors.append(f"{kind}, Zeile {row_no}: '{key}' fehlt")
            elif k in out:
                errors.append(f"{kind}, Zeile {row_no}: '{k}' kommt doppelt vor")
            else:
                out[k] = (row_no, row)
        return out

    def slots(kind: str, row_no: int, value) -> list[list[int]]:
        try:
            return parse_slots(value, n_periods)
        except ValueError as exc:
            errors.append(f"{kind}, Zeile {row_no}: {exc}")
            return []

    def number(kind: str, row_no: int, value, default=None):
        try:
            return _int(value, default)
        except ValueError:
            errors.append(f"{kind}, Zeile {row_no}: '{value}' ist keine Zahl")
            return default

    subjects = {
        k: models.Subject(
            short=k,
            name=_text(row.get("Name")),
            color=_text(row.get("Farbe"))
            if re.fullmatch(r"#[0-9a-fA-F]{6}", _text(row.get("Farbe")))
            else "#9aa5b1",
        )
        for k, (_, row) in unique("Fächer", "Kürzel", data["Fächer"]).items()
    }
    teachers = {
        k: models.Teacher(
            short=k,
            name=_text(row.get("Name")),
            max_per_day=number("Lehrkräfte", n, row.get("Max. Stunden/Tag")),
            unavailable=slots("Lehrkräfte", n, row.get("Gesperrt")),
        )
        for k, (n, row) in unique("Lehrkräfte", "Kürzel", data["Lehrkräfte"]).items()
    }
    rooms = {
        k: models.Room(
            short=k,
            name=_text(row.get("Name")),
            capacity=number("Räume", n, row.get("Plätze")),
            unavailable=slots("Räume", n, row.get("Gesperrt")),
        )
        for k, (n, row) in unique("Räume", "Kürzel", data["Räume"]).items()
    }
    classes = {}
    for k, (n, row) in unique("Klassen", "Name", data["Klassen"]).items():
        home = _text(row.get("Stammraum"))
        if home and home not in rooms:
            errors.append(f"Klassen, Zeile {n}: Raum '{home}' gibt es nicht")
        classes[k] = models.SchoolClass(
            name=k, home_room=rooms.get(home), unavailable=slots("Klassen", n, row.get("Gesperrt"))
        )

    lessons = []
    for n, row in data["Unterricht"]:

        def refs(col: str, pool: dict, label: str, row=row, n=n) -> list:
            out = []
            for key in _split(row.get(col)):
                if key in pool:
                    out.append(pool[key])
                else:
                    errors.append(f"Unterricht, Zeile {n}: {label} '{key}' gibt es nicht")
            return out

        subj = _text(row.get("Fach"))
        if subj not in subjects:
            errors.append(f"Unterricht, Zeile {n}: Fach '{subj}' gibt es nicht")
            continue
        cls = refs("Klassen", classes, "Klasse")
        if not cls:
            errors.append(f"Unterricht, Zeile {n}: keine Klasse angegeben")
        hours = number("Unterricht", n, row.get("Stunden/Woche"), 1) or 0
        doubles = number("Unterricht", n, row.get("Doppelstunden"), 0) or 0
        if hours < 1:
            errors.append(f"Unterricht, Zeile {n}: Stunden/Woche muss mindestens 1 sein")
        if doubles * 2 > hours:
            errors.append(f"Unterricht, Zeile {n}: mehr Doppelstunden als Wochenstunden")
        lessons.append(
            models.Lesson(
                subject=subjects[subj],
                classes=cls,
                teachers=refs("Lehrkräfte", teachers, "Lehrkraft"),
                rooms=refs("Räume", rooms, "Raum"),
                periods_per_week=hours,
                double_periods=doubles,
                note=_text(row.get("Notiz"))[:200],
            )
        )

    if errors:
        raise ImportError_(errors)

    clear_all(session, keep_periods=not periods)
    session.add_all(periods)
    for group in (subjects, teachers, rooms, classes):
        session.add_all(group.values())
    session.add_all(lessons)
    get_settings(session)
    session.commit()
    return {
        "Zeitraster": len(periods),
        "Fächer": len(subjects),
        "Lehrkräfte": len(teachers),
        "Räume": len(rooms),
        "Klassen": len(classes),
        "Unterricht": len(lessons),
    }


def clear_all(session: Session, keep_periods: bool = False) -> None:
    for model in (
        models.Timetable,
        models.Constraint,
        models.Lesson,
        models.SchoolClass,
        models.Teacher,
        models.Room,
        models.Subject,
    ):
        session.execute(delete(model))
    if not keep_periods:
        session.execute(delete(models.Period))
    session.flush()
