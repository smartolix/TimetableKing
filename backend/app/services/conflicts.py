"""Konfliktprüfung für einen Plan (nach manuellen Änderungen)."""

from collections import defaultdict

from app import models
from app.schemas import Conflict
from app.services.groups import AtomIndex

DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def slot_name(day: int, period: int) -> str:
    return f"{DAY_SHORT[day] if day < len(DAY_SHORT) else day}{period + 1}"


def lesson_short(lesson: models.Lesson) -> str:
    return "/".join(s.short for s in lesson.subjects) or f"#{lesson.id}"


def placement_rooms(pl: models.Placement) -> dict[int, int]:
    return {int(k): v for k, v in (pl.rooms or {}).items() if v is not None}


def find_conflicts(
    placements: list[models.Placement],
    lessons: dict[int, models.Lesson],
    n_days: int,
    periods: list[models.Period],
    rooms: dict[int, models.Room],
    atoms: AtomIndex,
    only: set[int] | None = None,
) -> list[Conflict]:
    """Alle Konflikte im Plan. Mit `only` nur Konflikte, an denen diese Blöcke beteiligt sind."""
    n_periods = len(periods)
    break_after = {p.index for p in periods if p.break_after}
    out: list[Conflict] = []
    occ: dict[tuple[str, int, int, int], list[models.Placement]] = defaultdict(list)

    def add(kind: str, msg: str, pls: list[models.Placement], day: int, period: int) -> None:
        out.append(
            Conflict(kind=kind, message=msg, placement_ids=[p.id for p in pls], day=day, period=period)
        )

    for pl in placements:
        lesson = lessons.get(pl.lesson_id)
        if lesson is None:
            continue
        name = lesson_short(lesson)
        if pl.day >= n_days or pl.period + pl.length > n_periods:
            add("outside", f"{name}: außerhalb des Zeitrasters", [pl], pl.day, pl.period)
            continue
        if any(p in break_after for p in range(pl.period, pl.period + pl.length - 1)):
            add("break", f"{name}: Doppelstunde über die Pause", [pl], pl.day, pl.period)
        part_atoms = {a for part in lesson.parts for a in atoms.for_part(part)}
        classes = {c.id: c for c in lesson.classes}
        chosen = placement_rooms(pl)
        for q in range(pl.period, pl.period + pl.length):
            slot = [pl.day, q]
            for t in lesson.teachers:
                occ[("teacher", t.id, pl.day, q)].append(pl)
                if slot in (t.unavailable or []):
                    add("unavailable", f"{t.short} ist {slot_name(pl.day, q)} gesperrt", [pl], pl.day, q)
            for a in part_atoms:
                occ[("atom", a, pl.day, q)].append(pl)
            for c in classes.values():
                if slot in (c.unavailable or []):
                    add(
                        "unavailable", f"Klasse {c.name} ist {slot_name(pl.day, q)} gesperrt", [pl], pl.day, q
                    )
            for r in chosen.values():
                occ[("room", r, pl.day, q)].append(pl)
                room = rooms.get(r)
                if room is not None and slot in (room.unavailable or []):
                    add(
                        "unavailable",
                        f"Raum {room.short} ist {slot_name(pl.day, q)} gesperrt",
                        [pl],
                        pl.day,
                        q,
                    )

    seen_class: set[tuple] = set()
    for (kind, rid, day, q), pls in occ.items():
        if len(pls) < 2:
            continue
        if kind == "teacher":
            t = next(t for t in lessons[pls[0].lesson_id].teachers if t.id == rid)
            add("teacher", f"Lehrkraft {t.short} ist {slot_name(day, q)} doppelt belegt", pls, day, q)
        elif kind == "atom":
            cid = atoms.atoms[rid][0]
            key = (cid, day, q, tuple(sorted(p.id for p in pls)))
            if key in seen_class:
                continue
            seen_class.add(key)
            cname = atoms.labels[rid].split(" (")[0]
            add("class", f"Klasse {cname} ist {slot_name(day, q)} doppelt belegt", pls, day, q)
        else:
            label = rooms[rid].short if rid in rooms else f"#{rid}"
            add("room", f"Raum {label} ist {slot_name(day, q)} doppelt belegt", pls, day, q)

    if only is not None:
        out = [c for c in out if only & set(c.placement_ids)]
    return out
