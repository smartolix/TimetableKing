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
    subject_id: int | None = None


@dataclass
class FixedCard:
    lesson_id: int
    day: int
    period: int
    length: int
    room_id: int | None


@dataclass
class ConstraintSpec:
    """Eine Bedingung aus dem Katalog (siehe app/constraint_catalog.py)."""

    id: int
    type: str
    params: dict
    weight: int | None  # None = feste Regel („Muss“)
    label: str = ""


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
    constraints: list[ConstraintSpec] = field(default_factory=list)
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
    # Bedingungs-ID -> Anzahl Verletzungen (nur weiche Bedingungen können verletzt sein)
    report: dict[int, int] = field(default_factory=dict)

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


HARD_RELAXED_WEIGHT = 1000  # Gewicht für „Muss“-Bedingungen, wenn gelockert wird


class Builder:
    """Baut das CP-SAT-Modell und bietet Hilfsgrößen für die Bedingungen."""

    def __init__(self, problem: Problem, cards: list[_Card], relax: bool):
        self.p = problem
        self.cards = cards
        self.relax = relax
        self.nD, self.nP = problem.n_days, problem.n_periods
        self.m = cp_model.CpModel()
        self.occ: dict[tuple[str, int, int, int], list] = defaultdict(list)  # ("t"|"c"|"r", id, tag, stunde)
        self.options: list[list[tuple]] = []  # pro Karte: (var, tag, stunde, raum)
        self.objective: list = []
        self.violations: dict[int, list] = defaultdict(list)  # Bedingungs-ID -> Verletzungs-Terme
        self._busy: dict = {}
        self._day_busy: dict = {}
        self._gaps: dict = {}
        self._any: dict = {}
        self.teachers = sorted({t for lesson in problem.lessons for t in lesson.teacher_ids})
        self.classes = sorted({c for lesson in problem.lessons for c in lesson.class_ids})
        self.rooms = sorted({r for lesson in problem.lessons for r in lesson.room_options})

    # ---- Grundgrößen ----

    def busy(self, kind: str, rid: int, d: int, p: int):
        """1, wenn Lehrkraft/Klasse/Raum in (d, p) belegt ist; None, wenn das nie passieren kann."""
        key = (kind, rid, d, p)
        if key not in self._busy:
            vars_ = self.occ.get(key, [])
            if not vars_:
                self._busy[key] = None
            elif len(vars_) == 1:
                self._busy[key] = vars_[0]
            else:
                b = self.m.new_bool_var("")
                self.m.add(b == sum(vars_))  # höchstens 1 wegen AtMostOne
                self._busy[key] = b
        return self._busy[key]

    def day_busy(self, kind: str, rid: int, d: int):
        key = (kind, rid, d)
        if key not in self._day_busy:
            bs = [b for p in range(self.nP) if (b := self.busy(kind, rid, d, p)) is not None]
            self._day_busy[key] = self.any_of(bs)
        return self._day_busy[key]

    def any_of(self, bools: list):
        """Oder-Verknüpfung als Bool-Variable (None bei leerer Liste)."""
        bools = [b for b in bools if b is not None]
        if not bools:
            return None
        if len(bools) == 1:
            return bools[0]
        key = tuple(sorted(b.index for b in bools))
        if key not in self._any:
            v = self.m.new_bool_var("")
            self.m.add_max_equality(v, bools)
            self._any[key] = v
        return self._any[key]

    def gaps(self, kind: str, rid: int, d: int) -> list:
        """Hohlstunden-Variablen eines Tages (frei, aber vorher und nachher belegt)."""
        key = (kind, rid, d)
        if key not in self._gaps:
            busy = [self.busy(kind, rid, d, p) for p in range(self.nP)]
            terms = []
            if sum(b is not None for b in busy) >= 2:
                for p in range(1, self.nP - 1):
                    before = self.any_of(busy[:p])
                    after = self.any_of(busy[p + 1 :])
                    if before is None or after is None:
                        continue
                    gap = self.m.new_bool_var("")
                    here = busy[p] if busy[p] is not None else 0
                    self.m.add(gap >= before + after - here - 1)
                    terms.append(gap)
            self._gaps[key] = terms
        return self._gaps[key]

    def card_options(self, match):
        """Alle Optionen (var, tag, stunde, länge, karte) von Karten, deren Unterricht `match` erfüllt."""
        for card, opts in zip(self.cards, self.options, strict=True):
            if match(card.lesson):
                for v, d, p, _r in opts:
                    yield v, d, p, card.length, card

    # ---- Bedingungen als feste Regel oder Strafpunkte ----

    def weight(self, spec: ConstraintSpec) -> int | None:
        if spec.weight is None:
            return HARD_RELAXED_WEIGHT if self.relax else None
        return spec.weight

    def at_most(self, spec: ConstraintSpec, expr, bound: int, ub: int) -> None:
        """expr <= bound; weich: jede Einheit darüber kostet Gewicht."""
        if isinstance(expr, int):
            self._constant(spec, expr - bound)
            return
        w = self.weight(spec)
        if w is None:
            self.m.add(expr <= bound)
            return
        excess = self.m.new_int_var(0, max(0, ub), "")
        self.m.add(expr - bound <= excess)
        self.objective.append(w * excess)
        self.violations[spec.id].append(excess)

    def at_least(self, spec: ConstraintSpec, expr, bound: int, ub: int) -> None:
        if isinstance(expr, int):
            self._constant(spec, bound - expr)
            return
        w = self.weight(spec)
        if w is None:
            self.m.add(expr >= bound)
            return
        short = self.m.new_int_var(0, max(0, ub), "")
        self.m.add(bound - expr <= short)
        self.objective.append(w * short)
        self.violations[spec.id].append(short)

    def _constant(self, spec: ConstraintSpec, excess: int) -> None:
        """Bedingung hängt von keiner Variable ab (z. B. Klasse ohne Unterricht)."""
        if excess <= 0:
            return
        if self.weight(spec) is None:
            self.m.add_bool_or([])  # nicht erfüllbar
        else:
            self.violations[spec.id].append(excess)

    def forbid(self, spec: ConstraintSpec, var) -> None:
        """Bool-Variable soll 0 sein."""
        w = self.weight(spec)
        if w is None:
            self.m.add(var == 0)
        else:
            self.objective.append(w * var)
            self.violations[spec.id].append(var)


def solve(
    problem: Problem,
    time_limit: float = 30.0,
    workers: int = 8,
    seed: int = 0,
    relax: bool = False,
) -> Solution:
    from app.solver.constraints import apply_constraint  # zirkulären Import vermeiden

    started = time.monotonic()
    errors = precheck(problem)
    cards, card_errors = _cards(problem)
    errors += card_errors
    if errors:
        return Solution("invalid", [], None, 0.0, errors)

    b = Builder(problem, cards, relax)
    m, nD, nP = b.m, b.nD, b.nP
    lesson_day: dict[tuple[int, int], list] = defaultdict(list)
    lesson_day_fixed: dict[tuple[int, int], int] = defaultdict(int)
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
                    b.occ[("t", t, d, q)].append(v)
                for c in lesson.class_ids:
                    b.occ[("c", c, d, q)].append(v)
                if r is not None:
                    b.occ[("r", r, d, q)].append(v)
                if q >= problem.weights.late_from:
                    late_terms.append(v * len(lesson.class_ids))
            lesson_day[(lesson.id, d)].append(v)
        if card.fixed is not None:
            m.add(opts[0][0] == 1)
            lesson_day_fixed[(lesson.id, card.fixed.day)] += 1
        else:
            m.add_exactly_one(v for v, *_ in opts)
        b.options.append(opts)

    for vars_ in b.occ.values():
        if len(vars_) > 1:
            m.add_at_most_one(vars_)

    # Verteilung über die Woche: höchstens ceil(Blöcke / Tage) Blöcke pro Tag
    for lesson in problem.lessons:
        cap = max(1, math.ceil(len(lesson.cards) / nD))
        for d in range(nD):
            vars_ = lesson_day.get((lesson.id, d))
            if vars_:
                m.add(sum(vars_) <= max(cap, lesson_day_fixed[(lesson.id, d)]))

    # Höchststunden pro Tag aus den Stammdaten der Lehrkraft
    for t, cap in problem.teacher_max_per_day.items():
        for d in range(nD):
            vars_ = [v for p in range(nP) for v in b.occ.get(("t", t, d, p), [])]
            if len(vars_) > cap:
                m.add(sum(vars_) <= cap)

    # Bedingungen aus dem Katalog
    for spec in problem.constraints:
        apply_constraint(b, spec)

    # Allgemeine Gewichte (Einstellungen)
    w = problem.weights
    if w.class_gap:
        b.objective += [w.class_gap * g for c in b.classes for d in range(nD) for g in b.gaps("c", c, d)]
    if w.teacher_gap:
        b.objective += [w.teacher_gap * g for t in b.teachers for d in range(nD) for g in b.gaps("t", t, d)]
    if w.late:
        b.objective += [w.late * t for t in late_terms]
    if b.objective:
        m.minimize(sum(b.objective))

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
            "infeasible": "Es gibt keinen Plan, der alle festen Regeln erfüllt. Sperrzeiten, Höchststunden, "
            "fixierte Stunden oder „Muss“-Bedingungen lockern, oder mit „Bedingungen lockern“ rechnen.",
            "unknown": "In der vorgegebenen Zeit wurde kein Plan gefunden. Mehr Rechenzeit geben "
            "oder mit „Bedingungen lockern“ rechnen.",
        }.get(status_name, "Das Modell ist ungültig.")
        return Solution(status_name, [], None, seconds, [msg])

    placements = []
    for card, opts in zip(cards, b.options, strict=True):
        for v, d, p, r in opts:
            if solver.boolean_value(v):
                placements.append(
                    PlacedCard(card.lesson.id, d, p, card.length, r, locked=card.fixed is not None)
                )
                break
    report = {
        cid: int(sum(t if isinstance(t, int) else solver.value(t) for t in terms))
        for cid, terms in b.violations.items()
    }
    for spec in problem.constraints:
        report.setdefault(spec.id, 0)
    objective_value = solver.objective_value if b.objective else 0.0
    return Solution(status_name, placements, objective_value, seconds, [], report)
