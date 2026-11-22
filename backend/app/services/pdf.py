"""PDF-Export: ein Wochenraster pro Klasse, Lehrkraft oder Raum (A4 quer)."""

import io
from dataclasses import dataclass

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.problem import get_settings, load_lessons, load_periods

DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
VIEWS = ("class", "teacher", "room")

_title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20)
_sub = ParagraphStyle("s", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#555f6d"))
_cell = ParagraphStyle("c", fontName="Helvetica", fontSize=8, leading=9.5, alignment=1)
_head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=9, alignment=1)
_period = ParagraphStyle("p", fontName="Helvetica", fontSize=7.5, leading=9, alignment=1)


@dataclass
class _Entity:
    id: int
    title: str


def _tint(hex_color: str, amount: float = 0.72) -> colors.Color:
    c = colors.HexColor(hex_color)
    return colors.Color(
        c.red + (1 - c.red) * amount, c.green + (1 - c.green) * amount, c.blue + (1 - c.blue) * amount
    )


def render_pdf(session: Session, timetable: models.Timetable, view: str, entity_id: int | None) -> bytes:
    if view not in VIEWS:
        raise ValueError("Ansicht muss class, teacher oder room sein")
    settings = get_settings(session)
    periods = load_periods(session)
    lessons = {lesson.id: lesson for lesson in load_lessons(session)}
    rooms = {r.id: r for r in session.scalars(select(models.Room))}

    if view == "class":
        entities = [
            _Entity(c.id, f"Klasse {c.name}")
            for c in session.scalars(select(models.SchoolClass).order_by(models.SchoolClass.name))
        ]
    elif view == "teacher":
        entities = [
            _Entity(t.id, f"{t.name or t.short} ({t.short})" if t.name else t.short)
            for t in session.scalars(select(models.Teacher).order_by(models.Teacher.short))
        ]
    else:
        entities = [
            _Entity(r.id, f"Raum {r.short}" + (f" – {r.name}" if r.name else ""))
            for r in session.scalars(select(models.Room).order_by(models.Room.short))
        ]
    if entity_id is not None:
        entities = [e for e in entities if e.id == entity_id]
        if not entities:
            raise LookupError("Eintrag nicht gefunden")

    def belongs(pl: models.Placement, eid: int) -> bool:
        lesson = lessons.get(pl.lesson_id)
        if lesson is None:
            return False
        if view == "class":
            return any(c.id == eid for c in lesson.classes)
        if view == "teacher":
            return any(t.id == eid for t in lesson.teachers)
        return pl.room_id == eid

    def text(pl: models.Placement) -> str:
        lesson = lessons[pl.lesson_id]
        room = rooms[pl.room_id].short if pl.room_id in rooms else ""
        teachers = ", ".join(t.short for t in lesson.teachers)
        klass = ", ".join(c.name for c in lesson.classes)
        second = {"class": teachers, "teacher": klass, "room": f"{klass} · {teachers}"}[view]
        third = room if view != "room" else ""
        lines = [f"<b>{lesson.subject.short}</b>", second, third]
        return "<br/>".join(x for x in lines if x)

    buf = io.BytesIO()
    page_w, page_h = landscape(A4)
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=timetable.name,
    )
    n_days, n_periods = settings.days, len(periods)
    first_col = 22 * mm
    day_w = (page_w - 24 * mm - first_col) / max(1, n_days)
    row_h = min(18 * mm, (page_h - 60 * mm) / max(1, n_periods))
    story = []
    for i, ent in enumerate(entities):
        grid = [[Paragraph("", _head)] + [Paragraph(DAY_NAMES[d], _head) for d in range(n_days)]]
        for p in periods:
            times = f"{p.start}–{p.end}" if p.start and p.end else ""
            grid.append([Paragraph(f"<b>{p.label or p.index + 1}</b><br/>{times}", _period)] + [""] * n_days)
        style = [
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c5ccd6")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef1f5")),
            ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f6f7f9")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        for p in periods:
            if p.break_after and p.index + 1 < n_periods:
                style.append(
                    ("LINEBELOW", (0, p.index + 1), (-1, p.index + 1), 1.4, colors.HexColor("#8a94a3"))
                )
        for pl in sorted(timetable.placements, key=lambda x: (x.day, x.period)):
            if not belongs(pl, ent.id) or pl.day >= n_days or pl.period + pl.length > n_periods:
                continue
            col, row = pl.day + 1, pl.period + 1
            existing = grid[row][col]
            content = text(pl)
            if isinstance(existing, Paragraph):  # Konflikt: zwei Blöcke im selben Feld
                content = existing.text + "<br/>" + content
            grid[row][col] = Paragraph(content, _cell)
            if pl.length > 1:
                style.append(("SPAN", (col, row), (col, row + pl.length - 1)))
            color = lessons[pl.lesson_id].subject.color or "#9aa5b1"
            style.append(("BACKGROUND", (col, row), (col, row + pl.length - 1), _tint(color)))
        table = Table(
            grid, colWidths=[first_col] + [day_w] * n_days, rowHeights=[8 * mm] + [row_h] * n_periods
        )
        table.setStyle(TableStyle(style))
        story += [
            Paragraph(ent.title, _title),
            Paragraph(
                f"{settings.school_name + ' · ' if settings.school_name else ''}{timetable.name}", _sub
            ),
            Spacer(1, 5 * mm),
            table,
        ]
        if i < len(entities) - 1:
            story.append(PageBreak())
    if not story:
        story.append(Paragraph("Keine Einträge vorhanden.", _sub))
    doc.build(story)
    return buf.getvalue()
