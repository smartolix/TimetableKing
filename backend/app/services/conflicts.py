"""Konfliktprüfung für einen Plan (nach manuellen Änderungen)."""

from collections import defaultdict

from app import models
from app.schemas import Conflict

DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def slot_name(day: int, period: int) -> str:
    return f"{DAY_SHORT[day] if day < len(DAY_SHORT) else day}{period + 1}"


def find_conflicts(
    placements: list[models.Placement],
    lessons: dict[int, models.Lesson],
    n_days: int,
    periods: list[models.Period],
    rooms: dict[int, models.Room] | None = None,
    only: set[int] | None = None,
) -> list[Conflict]:
    """Alle Konflikte im Plan. Mit `only` nur Konflikte, an denen diese Blöcke beteiligt sind."""
    rooms = rooms or {}
    n_periods = len(periods)
    break_after = {p.index for p in periods if p.break_after}
    out: list[Conflict] = []
    occ: dict[tuple[str, int, int, int], list[models.Placement]] = defaultdict(list)

    for pl in placements:
        lesson = lessons.get(pl.lesson_id)
        if lesson is None:
            continue
        if pl.day >= n_days or pl.period + pl.length > n_periods:
            out.append(
                Conflict(
                    kind="outside",
                    message=f"{lesson.subject.short}: außerhalb des Zeitrasters",
                    placement_ids=[pl.id],
                    day=pl.day,
                    period=pl.period,
                )
            )
            continue
        if any(p in break_after for p in range(pl.period, pl.period + pl.length - 1)):
            out.append(
                Conflict(
                    kind="break",
                    message=f"{lesson.subject.short}: Doppelstunde über die Pause",
                    placement_ids=[pl.id],
                    day=pl.day,
                    period=pl.period,
                )
            )
        for q in range(pl.period, pl.period + pl.length):
            for t in lesson.teachers:
                occ[("teacher", t.id, pl.day, q)].append(pl)
                if [pl.day, q] in (t.unavailable or []):
                    out.append(
                        Conflict(
                            kind="unavailable",
                            placement_ids=[pl.id],
                            day=pl.day,
                            period=q,
                            message=f"{t.short} ist {slot_name(pl.day, q)} gesperrt",
                        )
                    )
            for c in lesson.classes:
                occ[("class", c.id, pl.day, q)].append(pl)
                if [pl.day, q] in (c.unavailable or []):
                    out.append(
                        Conflict(
                            kind="unavailable",
                            placement_ids=[pl.id],
                            day=pl.day,
                            period=q,
                            message=f"Klasse {c.name} ist {slot_name(pl.day, q)} gesperrt",
                        )
                    )
            if pl.room_id is not None:
                occ[("room", pl.room_id, pl.day, q)].append(pl)
                room = rooms.get(pl.room_id)
                if room is not None and [pl.day, q] in (room.unavailable or []):
                    out.append(
                        Conflict(
                            kind="unavailable",
                            placement_ids=[pl.id],
                            day=pl.day,
                            period=q,
                            message=f"Raum {room.short} ist {slot_name(pl.day, q)} gesperrt",
                        )
                    )

    names = {"teacher": "Lehrkraft", "class": "Klasse", "room": "Raum"}
    for (kind, rid, day, q), pls in occ.items():
        if len(pls) < 2:
            continue
        lesson = lessons[pls[0].lesson_id]
        if kind == "teacher":
            label = next(t.short for t in lesson.teachers if t.id == rid)
        elif kind == "class":
            label = next(c.name for c in lesson.classes if c.id == rid)
        else:
            label = rooms[rid].short if rid in rooms else f"#{rid}"
        out.append(
            Conflict(
                kind=kind,
                placement_ids=[p.id for p in pls],
                day=day,
                period=q,
                message=f"{names[kind]} {label} ist {slot_name(day, q)} doppelt belegt",
            )
        )

    if only is not None:
        out = [c for c in out if only & set(c.placement_ids)]
    return out
