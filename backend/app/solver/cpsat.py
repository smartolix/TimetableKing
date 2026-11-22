"""Stundenplan-Solver auf Basis von Google OR-Tools CP-SAT.

Das Modell ist unabhängig von der Datenbank: Es bekommt ein `Problem` und liefert ein `Solution`.

Harte Regeln
  * jeder Block (Einzel-/Doppelstunde) wird genau einmal gesetzt
  * keine Lehrkraft, Klasse oder kein Raum ist doppelt belegt
  * gesperrte Zeiten von Lehrkräften, Klassen und Räumen werden eingehalten
  * Doppelstunden gehen nicht über eine Pause und nicht über das Tagesende
  * Blöcke derselben Unterrichtseinheit liegen auf verschiedenen Tagen (soweit möglich)
  * Höchststunden pro Tag einer Lehrkraft
  * fixierte Blöcke bleiben, wo sie sind

Weiche Regeln (gewichtet in der Zielfunktion)
  * Hohlstunden von Klassen und Lehrkräften
  * Unterricht in späten Stunden
"""

from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

Slot = tuple[int, int]  # (tag, stunde)


@dataclass
class LessonSpec:
    id: int
    label: str
    class_ids: list[int]
    teacher_ids: list[int]
    # Räume, aus denen einer gewählt wird. Leer = kein Raum nötig.
    room_options: list[int]
    # Länge jedes Blocks, z. B. [2, 1, 1]
    cards: list[int]


@dataclass
class FixedCard:
    lesson_id: int
    day: int
    period: int
    length: int
    room_id: int | None


@dataclass
class Weights:
    class_gap: int = 20
    teacher_gap: int = 3
    late: int = 2
    late_from: int = 6  # 0-basierte Stunde, ab der "spät" gilt


@dataclass
class Problem:
    n_days: int
    n_periods: int
    lessons: list[LessonSpec]
    # Stunde p: nach p ist eine Pause (Doppelstunde p/p+1 verboten)
    break_after: set[int] = field(default_factory=set)
    teacher_unavailable: dict[int, set[Slot]] = field(default_factory=dict)
    class_unavailable: dict[int, set[Slot]] = field(default_factory=dict)
    room_unavailable: dict[int, set[Slot]] = field(default_factory=dict)
    teacher_max_per_day: dict[int, int] = field(default_factory=dict)
    fixed: list[FixedCard] = field(default_factory=list)
    weights: Weights = field(default_factory=Weights)
    # nur für verständliche Fehlermeldungen
    teacher_names: dict[int, str] = field(default_factory=dict)
    class_names: dict[int, str] = field(default_factory=dict)


@dataclass
class PlacedCard:
    lesson_id: int
    day: int
    period: int
    length: int
    room_id: int | None
    locked: bool = False


@dataclass
class Solution:
    # optimal | feasible | infeasible | invalid | unknown
    status: str
    placements: list[PlacedCard]
    objective: float | None
    seconds: float
    messages: list[str]

    @property
    def ok(self) -> bool:
        return self.status in ("optimal", "feasible")


@dataclass
class _Card:
    lesson: LessonSpec
    length: int
    fixed: FixedCard | None = None


def precheck(problem: Problem) -> list[str]:
    """Findet offensichtliche Fehler, bevor der Solver lange rechnet."""
    errors: list[str] = []
    n_slots = problem.n_days * problem.n_periods
    teacher_load: dict[int, int] = defaultdict(int)
    class_load: dict[int, int] = defaultdict(int)
    for lesson in problem.lessons:
        hours = sum(lesson.cards)
        for t in lesson.teacher_ids:
            teacher_load[t] += hours
        for c in lesson.class_ids:
            class_load[c] += hours
        if any(length > problem.n_periods for length in lesson.cards):
            errors.append(f"{lesson.label}: Block ist länger als ein Schultag.")
    for t, load in teacher_load.items():
        free = n_slots - len(problem.teacher_unavailable.get(t, ()))
        cap = problem.teacher_max_per_day.get(t)
        if cap is not None:
            free = min(free, cap * problem.n_days)
        if load > free:
            errors.append(
                f"Lehrkraft {problem.teacher_names.get(t, f'#{t}')}: {load} Stunden, aber nur {free} mögliche Stunden pro Woche."
            )
    for c, load in class_load.items():
        free = n_slots - len(problem.class_unavailable.get(c, ()))
        if load > free:
            errors.append(
                f"Klasse {problem.class_names.get(c, f'#{c}')}: {load} Stunden, aber nur {free} freie Stunden pro Woche."
            )
    return errors


def _cards(problem: Problem) -> tuple[list[_Card], list[str]]:
    """Ordnet die fixierten Blöcke den Blöcken der Unterrichtseinheiten zu."""
    errors: list[str] = []
    fixed_by_lesson: dict[int, list[FixedCard]] = defaultdict(list)
    for f in problem.fixed:
        fixed_by_lesson[f.lesson_id].append(f)
    cards: list[_Card] = []
    known = {lesson.id for lesson in problem.lessons}
    for lesson_id in fixed_by_lesson:
        if lesson_id not in known:
            errors.append(f"Fixierter Block gehört zu unbekannter Unterrichtseinheit #{lesson_id}.")
    for lesson in problem.lessons:
        remaining = list(lesson.cards)
        for f in fixed_by_lesson.get(lesson.id, []):
            if f.length in remaining:
                remaining.remove(f.length)
                cards.append(_Card(lesson, f.length, f))
            else:
                errors.append(f"{lesson.label}: Fixierter Block passt nicht mehr zur Stundenzahl.")
        cards.extend(_Card(lesson, length) for length in remaining)
    return cards, errors


def solve(
    problem: Problem,
    time_limit: float = 30.0,
    workers: int = 8,
    seed: int = 0,
) -> Solution:
    started = time.monotonic()
    errors = precheck(problem)
    cards, card_errors = _cards(problem)
    errors += card_errors
    if errors:
        return Solution("invalid", [], None, 0.0, errors)

    nD, nP = problem.n_days, problem.n_periods
    m = cp_model.CpModel()

    # Belegung je Ressource und Zeitfenster: Liste von (Variable) bzw. Konstante 1 bei Fixierung
    teacher_occ: dict[tuple[int, int, int], list] = defaultdict(list)
    class_occ: dict[tuple[int, int, int], list] = defaultdict(list)
    room_occ: dict[tuple[int, int, int], list] = defaultdict(list)
    # Starts je Unterrichtseinheit und Tag (für die Verteilung über die Woche)
    lesson_day: dict[tuple[int, int], list] = defaultdict(list)
    lesson_day_fixed: dict[tuple[int, int], int] = defaultdict(int)
    # Pro Karte: Liste (var, tag, stunde, raum)
    options: list[list[tuple]] = []
    late_terms = []

    def blocked(lesson: LessonSpec, day: int, start: int, length: int) -> bool:
        for p in range(start, start + length):
            s = (day, p)
            if any(s in problem.teacher_unavailable.get(t, ()) for t in lesson.teacher_ids):
                return True
            if any(s in problem.class_unavailable.get(c, ()) for c in lesson.class_ids):
                return True
        # Doppelstunde darf nicht über eine Pause gehen
        return any(p in problem.break_after for p in range(start, start + length - 1))

    for k, card in enumerate(cards):
        lesson, length = card.lesson, card.length
        opts: list[tuple] = []
        if card.fixed is not None:
            f = card.fixed
            domain = [(f.day, f.period, f.room_id)]
        else:
            rooms: list[int | None] = list(lesson.room_options) or [None]
            domain = [
                (d, p, r)
                for d in range(nD)
                for p in range(nP - length + 1)
                if not blocked(lesson, d, p, length)
                for r in rooms
                if r is None
                or not any((d, q) in problem.room_unavailable.get(r, ()) for q in range(p, p + length))
            ]
        if not domain:
            return Solution(
                "invalid",
                [],
                None,
                time.monotonic() - started,
                [f"{lesson.label}: Für einen Block gibt es keinen möglichen Termin (Sperrzeiten prüfen)."],
            )
        for d, p, r in domain:
            v = m.new_bool_var(f"x{k}_{d}_{p}_{r}")
            opts.append((v, d, p, r))
            for q in range(p, p + length):
                for t in lesson.teacher_ids:
                    teacher_occ[(t, d, q)].append(v)
                for c in lesson.class_ids:
                    class_occ[(c, d, q)].append(v)
                if r is not None:
                    room_occ[(r, d, q)].append(v)
                if q >= problem.weights.late_from:
                    late_terms.append(v * len(lesson.class_ids))
            lesson_day[(lesson.id, d)].append(v)
        if card.fixed is not None:
            m.add(opts[0][0] == 1)
            lesson_day_fixed[(lesson.id, card.fixed.day)] += 1
        else:
            m.add_exactly_one(v for v, *_ in opts)
        options.append(opts)

    for occ in (teacher_occ, class_occ, room_occ):
        for vars_ in occ.values():
            if len(vars_) > 1:
                m.add_at_most_one(vars_)

    # Verteilung über die Woche: höchstens ceil(Blöcke / Tage) Blöcke pro Tag
    for lesson in problem.lessons:
        cap = max(1, math.ceil(len(lesson.cards) / nD))
        for d in range(nD):
            vars_ = lesson_day.get((lesson.id, d))
            if vars_:
                m.add(sum(vars_) <= max(cap, lesson_day_fixed[(lesson.id, d)]))

    # Höchststunden pro Tag
    for t, cap in problem.teacher_max_per_day.items():
        for d in range(nD):
            vars_ = [v for p in range(nP) for v in teacher_occ.get((t, d, p), [])]
            if len(vars_) > cap:
                m.add(sum(vars_) <= cap)

    # Hohlstunden: Stunde frei, aber vorher und nachher Unterricht am selben Tag
    def gap_terms(occ: dict, resource_ids: set[int]) -> list:
        terms = []
        for rid in resource_ids:
            for d in range(nD):
                busy = []
                for p in range(nP):
                    vars_ = occ.get((rid, d, p), [])
                    if not vars_:
                        busy.append(None)
                        continue
                    b = m.new_bool_var("")
                    m.add(b == sum(vars_))  # höchstens 1 wegen AtMostOne
                    busy.append(b)
                if sum(b is not None for b in busy) < 2:
                    continue
                for p in range(1, nP - 1):
                    before = [b for b in busy[:p] if b is not None]
                    after = [b for b in busy[p + 1 :] if b is not None]
                    if not before or not after:
                        continue
                    any_before = m.new_bool_var("")
                    any_after = m.new_bool_var("")
                    m.add_max_equality(any_before, before)
                    m.add_max_equality(any_after, after)
                    gap = m.new_bool_var("")
                    here = busy[p] if busy[p] is not None else 0
                    m.add(gap >= any_before + any_after - here - 1)
                    terms.append(gap)
        return terms

    w = problem.weights
    objective = []
    if w.class_gap:
        class_ids = {c for lesson in problem.lessons for c in lesson.class_ids}
        objective += [w.class_gap * g for g in gap_terms(class_occ, class_ids)]
    if w.teacher_gap:
        teacher_ids = {t for lesson in problem.lessons for t in lesson.teacher_ids}
        objective += [w.teacher_gap * g for g in gap_terms(teacher_occ, teacher_ids)]
    if w.late:
        objective += [w.late * t for t in late_terms]
    if objective:
        m.minimize(sum(objective))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_workers = max(1, workers)
    solver.parameters.random_seed = seed
    status = solver.solve(m)
    seconds = time.monotonic() - started

    names = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "invalid",
    }
    status_name = names.get(status, "unknown")
    if status_name not in ("optimal", "feasible"):
        msg = {
            "infeasible": "Es gibt keinen Plan, der alle harten Regeln erfüllt. "
            "Sperrzeiten, Höchststunden oder fixierte Stunden lockern.",
            "unknown": "In der vorgegebenen Zeit wurde kein Plan gefunden. Mehr Rechenzeit geben.",
        }.get(status_name, "Das Modell ist ungültig.")
        return Solution(status_name, [], None, seconds, [msg])

    placements = []
    for card, opts in zip(cards, options, strict=True):
        for v, d, p, r in opts:
            if solver.boolean_value(v):
                placements.append(
                    PlacedCard(card.lesson.id, d, p, card.length, r, locked=card.fixed is not None)
                )
                break
    objective_value = solver.objective_value if objective else 0.0
    return Solution(status_name, placements, objective_value, seconds, [])
