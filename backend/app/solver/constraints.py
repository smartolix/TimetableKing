"""Umsetzung der Bedingungsarten aus `app/constraint_catalog.py` im CP-SAT-Modell.

Jede Funktion bekommt den `Builder` und die Bedingung. Sie nutzt `b.at_most`, `b.at_least` oder `b.forbid`,
die je nach Wichtigkeit eine feste Regel oder Strafpunkte erzeugen.
"""

from collections.abc import Callable

from app.solver.cpsat import Builder, ConstraintSpec, LessonSpec

Handler = Callable[[Builder, ConstraintSpec], None]
HANDLERS: dict[str, Handler] = {}


def handler(key: str):
    def deco(fn: Handler) -> Handler:
        HANDLERS[key] = fn
        return fn

    return deco


def apply_constraint(b: Builder, spec: ConstraintSpec) -> None:
    fn = HANDLERS.get(spec.type)
    if fn is None:
        raise ValueError(f"Bedingungsart '{spec.type}' ist im Solver nicht umgesetzt")
    fn(b, spec)


# ---- Hilfsfunktionen ----


def _scope(ids: list[int] | None, all_ids: list[int]) -> list[int]:
    known = set(all_ids)
    return [i for i in ids if i in known] if ids else list(all_ids)


def _sum(items) -> int | object:
    items = [x for x in items if x is not None]
    return sum(items) if items else 0


def _day_count(b: Builder, kind: str, rid: int, d: int):
    return _sum(b.busy(kind, rid, d, p) for p in range(b.nP))


def _resource_constraints(kind: str, key: str):
    """Registriert die gleichartigen Bedingungen für Lehrkräfte ("t") und Klassen ("c")."""
    ids_param = "teacher_ids" if kind == "t" else "class_ids"

    def ids(b: Builder, spec: ConstraintSpec) -> list[int]:
        return _scope(spec.params.get(ids_param), b.teachers if kind == "t" else b.classes)

    @handler(f"{key}_max_per_day")
    def max_per_day(b: Builder, spec: ConstraintSpec) -> None:
        for rid in ids(b, spec):
            for d in range(b.nD):
                b.at_most(spec, _day_count(b, kind, rid, d), spec.params["max"], b.nP)

    @handler(f"{key}_max_gaps_day")
    def max_gaps_day(b: Builder, spec: ConstraintSpec) -> None:
        for rid in ids(b, spec):
            for d in range(b.nD):
                gaps = b.gaps(kind, rid, d)
                if len(gaps) > spec.params["max"]:
                    b.at_most(spec, sum(gaps), spec.params["max"], b.nP)

    @handler(f"{key}_lunch")
    def lunch(b: Builder, spec: ConstraintSpec) -> None:
        lo, hi = spec.params["from_period"], min(spec.params["to_period"], b.nP - 1)
        window = list(range(lo, hi + 1))
        for rid in ids(b, spec):
            for d in range(b.nD):
                bs = [b.busy(kind, rid, d, p) for p in window]
                if all(x is not None for x in bs) and window:
                    b.at_most(spec, sum(bs), len(window) - 1, len(window))

    @handler(f"{key}_max_in_slots")
    def max_in_slots(b: Builder, spec: ConstraintSpec) -> None:
        slots = [(d, p) for d, p in spec.params["slots"] if d < b.nD and p < b.nP]
        for rid in ids(b, spec):
            expr = _sum(b.busy(kind, rid, d, p) for d, p in slots)
            b.at_most(spec, expr, spec.params["max"], len(slots))

    return ids


_teacher_ids = _resource_constraints("t", "teacher")
_class_ids = _resource_constraints("c", "class")


@handler("teacher_min_per_day")
def teacher_min_per_day(b: Builder, spec: ConstraintSpec) -> None:
    mn = spec.params["min"]
    for t in _teacher_ids(b, spec):
        for d in range(b.nD):
            works = b.day_busy("t", t, d)
            if works is not None:
                b.at_least(spec, _day_count(b, "t", t, d) - mn * works, 0, mn)


@handler("teacher_max_consecutive")
def teacher_max_consecutive(b: Builder, spec: ConstraintSpec) -> None:
    mx = spec.params["max"]
    for t in _teacher_ids(b, spec):
        for d in range(b.nD):
            for start in range(0, b.nP - mx):
                window = [b.busy("t", t, d, p) for p in range(start, start + mx + 1)]
                if all(x is not None for x in window):
                    b.at_most(spec, sum(window), mx, 1)


@handler("teacher_max_gaps_week")
def teacher_max_gaps_week(b: Builder, spec: ConstraintSpec) -> None:
    for t in _teacher_ids(b, spec):
        gaps = [g for d in range(b.nD) for g in b.gaps("t", t, d)]
        if len(gaps) > spec.params["max"]:
            b.at_most(spec, sum(gaps), spec.params["max"], len(gaps))


@handler("teacher_max_days")
def teacher_max_days(b: Builder, spec: ConstraintSpec) -> None:
    for t in _teacher_ids(b, spec):
        days = [b.day_busy("t", t, d) for d in range(b.nD)]
        b.at_most(spec, _sum(days), spec.params["max"], b.nD)


@handler("teacher_free_day")
def teacher_free_day(b: Builder, spec: ConstraintSpec) -> None:
    days = [d for d in spec.params["days"] if d < b.nD]
    for t in _teacher_ids(b, spec):
        busy_days = [b.day_busy("t", t, d) for d in days]
        if busy_days and all(x is not None for x in busy_days):
            b.at_most(spec, sum(busy_days), len(days) - 1, 1)


@handler("teacher_start_by")
def teacher_start_by(b: Builder, spec: ConstraintSpec) -> None:
    last = spec.params["period"]
    for t in _teacher_ids(b, spec):
        for d in range(b.nD):
            works = b.day_busy("t", t, d)
            if works is None:
                continue
            early = _sum(b.busy("t", t, d, p) for p in range(0, last + 1))
            b.at_most(spec, works - early, 0, 1)


@handler("class_min_per_day")
def class_min_per_day(b: Builder, spec: ConstraintSpec) -> None:
    for c in _class_ids(b, spec):
        for d in range(b.nD):
            b.at_least(spec, _day_count(b, "c", c, d), spec.params["min"], spec.params["min"])


@handler("class_first_period")
def class_first_period(b: Builder, spec: ConstraintSpec) -> None:
    for c in _class_ids(b, spec):
        late = []
        for d in range(b.nD):
            works = b.day_busy("c", c, d)
            if works is None:
                continue
            first = b.busy("c", c, d, 0)
            late.append(works - first if first is not None else works)
        if late:
            b.at_most(spec, sum(late), spec.params["late_days"], b.nD)


# ---- Fächer ----


def _subject_classes(b: Builder, spec: ConstraintSpec, subjects: set[int]) -> list[int]:
    classes = {c for lesson in b.p.lessons if lesson.subject_id in subjects for c in lesson.class_ids}
    return [c for c in _scope(spec.params.get("class_ids"), b.classes) if c in classes]


def _matcher(subjects: set[int], class_id: int) -> Callable[[LessonSpec], bool]:
    return lambda lesson: lesson.subject_id in subjects and class_id in lesson.class_ids


class _SubjectView:
    """Zeitliche Lage einer Fächergruppe in einer Klasse."""

    def __init__(self, b: Builder, subjects: set[int], class_id: int):
        self.b = b
        self.cover: dict[tuple[int, int], list] = {}
        self.starts: dict[int, list] = {}
        for v, d, p, length, _card in b.card_options(_matcher(subjects, class_id)):
            self.starts.setdefault(d, []).append(v)
            for q in range(p, p + length):
                self.cover.setdefault((d, q), []).append(v)
        self._on_day: dict[int, object] = {}

    def busy(self, d: int, p: int):
        vs = self.cover.get((d, p), [])
        return sum(vs) if vs else None  # höchstens 1 (Klasse ist nie doppelt belegt)

    def blocks(self, d: int):
        return _sum(self.starts.get(d, []))

    def on_day(self, d: int):
        if d not in self._on_day:
            self._on_day[d] = self.b.any_of(self.starts.get(d, []))
        return self._on_day[d]


@handler("subject_max_per_day")
def subject_max_per_day(b: Builder, spec: ConstraintSpec) -> None:
    subjects = set(spec.params["subject_ids"])
    for c in _subject_classes(b, spec, subjects):
        view = _SubjectView(b, subjects, c)
        for d in range(b.nD):
            if len(view.starts.get(d, [])) > spec.params["max"]:
                b.at_most(spec, view.blocks(d), spec.params["max"], b.nP)


@handler("subject_not_consecutive_days")
def subject_not_consecutive_days(b: Builder, spec: ConstraintSpec) -> None:
    subjects = set(spec.params["subject_ids"])
    pairs = [(d, d + 1) for d in range(b.nD - 1)]
    if spec.params.get("wrap") and b.nD > 2:
        pairs.append((b.nD - 1, 0))
    for c in _subject_classes(b, spec, subjects):
        view = _SubjectView(b, subjects, c)
        for d1, d2 in pairs:
            a, z = view.on_day(d1), view.on_day(d2)
            if a is not None and z is not None:
                b.at_most(spec, a + z, 1, 1)


@handler("subject_forbidden_slots")
def subject_forbidden_slots(b: Builder, spec: ConstraintSpec) -> None:
    subjects = set(spec.params["subject_ids"])
    slots = {tuple(s) for s in spec.params["slots"]}
    only_doubles = spec.params.get("only_doubles", False)
    for c in _subject_classes(b, spec, subjects):
        for v, d, p, length, card in b.card_options(_matcher(subjects, c)):
            if card.fixed is not None or (only_doubles and length < 2):
                continue
            if any((d, q) in slots for q in range(p, p + length)):
                b.forbid(spec, v)


@handler("subject_max_in_slots")
def subject_max_in_slots(b: Builder, spec: ConstraintSpec) -> None:
    subjects = set(spec.params["subject_ids"])
    slots = [tuple(s) for s in spec.params["slots"]]
    for c in _subject_classes(b, spec, subjects):
        view = _SubjectView(b, subjects, c)
        expr = _sum(view.busy(d, p) for d, p in slots)
        if not isinstance(expr, int):
            b.at_most(spec, expr, spec.params["max"], len(slots))


@handler("subject_edge")
def subject_edge(b: Builder, spec: ConstraintSpec) -> None:
    subjects = set(spec.params["subject_ids"])
    for c in _subject_classes(b, spec, subjects):
        for v, d, p, length, _card in b.card_options(_matcher(subjects, c)):
            before = b.any_of([b.busy("c", c, d, q) for q in range(0, p)])
            after = b.any_of([b.busy("c", c, d, q) for q in range(p + length, b.nP)])
            if before is None or after is None:
                continue
            # Block liegt nicht am Rand, wenn vorher UND nachher Unterricht ist
            b.at_most(spec, v + before + after, 2, 1)


def _pair(b: Builder, spec: ConstraintSpec):
    a, z = {spec.params["subject_a"]}, {spec.params["subject_b"]}
    classes = [c for c in _subject_classes(b, spec, a) if c in _subject_classes(b, spec, z)]
    for c in classes:
        yield c, _SubjectView(b, a, c), _SubjectView(b, z, c)


@handler("subjects_not_same_day")
def subjects_not_same_day(b: Builder, spec: ConstraintSpec) -> None:
    for _c, va, vb in _pair(b, spec):
        for d in range(b.nD):
            x, y = va.on_day(d), vb.on_day(d)
            if x is not None and y is not None:
                b.at_most(spec, x + y, 1, 1)


@handler("subjects_not_adjacent")
def subjects_not_adjacent(b: Builder, spec: ConstraintSpec) -> None:
    for _c, va, vb in _pair(b, spec):
        for d in range(b.nD):
            for p in range(b.nP - 1):
                for first, second in ((va, vb), (vb, va)):
                    x, y = first.busy(d, p), second.busy(d, p + 1)
                    if x is not None and y is not None:
                        b.at_most(spec, x + y, 1, 1)


@handler("subjects_same_day")
def subjects_same_day(b: Builder, spec: ConstraintSpec) -> None:
    for _c, va, vb in _pair(b, spec):
        for d in range(b.nD):
            x, y = va.on_day(d), vb.on_day(d)
            if x is None:
                continue
            b.at_most(spec, x - (y if y is not None else 0), 0, 1)


@handler("subject_not_day_after")
def subject_not_day_after(b: Builder, spec: ConstraintSpec) -> None:
    for _c, va, vb in _pair(b, spec):
        for d in range(b.nD - 1):
            x, y = va.on_day(d), vb.on_day(d + 1)
            if x is not None and y is not None:
                b.at_most(spec, x + y, 1, 1)


# ---- Räume ----


@handler("room_max_days")
def room_max_days(b: Builder, spec: ConstraintSpec) -> None:
    for r in _scope(spec.params.get("room_ids"), b.rooms):
        days = [b.day_busy("r", r, d) for d in range(b.nD)]
        b.at_most(spec, _sum(days), spec.params["max"], b.nD)
