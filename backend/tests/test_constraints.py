from collections import defaultdict

import pytest

from app.solver.constraints import HANDLERS
from app.solver.cpsat import ConstraintSpec, LessonSpec, Problem, solve


def problem(constraints) -> Problem:
    # Fach 1 = M, 2 = D, 3 = BSP, 4 = BE; 2 Klassen, 3 Lehrkräfte
    lessons = [
        LessonSpec(1, "M 1a", [1], [1], [], [1, 1, 1, 1], subject_id=1),
        LessonSpec(2, "M 1b", [2], [1], [], [1, 1, 1], subject_id=1),
        LessonSpec(3, "D 1a", [1], [2], [], [2, 1, 1], subject_id=2),
        LessonSpec(4, "D 1b", [2], [2], [], [1, 1, 1, 1], subject_id=2),
        LessonSpec(5, "BSP 1a", [1], [3], [], [2, 1], subject_id=3),
        LessonSpec(6, "BSP 1b", [2], [3], [], [2, 1], subject_id=3),
        LessonSpec(7, "BE 1a", [1], [3], [], [1, 1], subject_id=4),
    ]
    return Problem(n_days=5, n_periods=6, lessons=lessons, constraints=constraints)


def run(*constraints, relax=False):
    p = problem(list(constraints))
    sol = solve(p, time_limit=10, workers=4, relax=relax)
    assert sol.ok, sol.messages
    lessons = {lesson.id: lesson for lesson in p.lessons}
    return sol, lessons


def busy(sol, lessons, kind):
    occ = defaultdict(set)
    for pl in sol.placements:
        lesson = lessons[pl.lesson_id]
        ids = lesson.teacher_ids if kind == "t" else lesson.class_ids
        for q in range(pl.period, pl.period + pl.length):
            for i in ids:
                occ[(i, pl.day)].add(q)
    return occ


def test_every_catalog_type_has_handler():
    from app.constraint_catalog import CATALOG

    assert {c.key for c in CATALOG} == set(HANDLERS)


def test_teacher_max_per_day_and_free_day():
    sol, lessons = run(
        ConstraintSpec(1, "teacher_max_per_day", {"teacher_ids": [1], "max": 2}, None),
        ConstraintSpec(2, "teacher_free_day", {"teacher_ids": [2], "days": [0, 4]}, None),
    )
    occ = busy(sol, lessons, "t")
    assert all(len(v) <= 2 for (t, _d), v in occ.items() if t == 1)
    assert not (occ.get((2, 0)) and occ.get((2, 4)))


def test_teacher_max_days_and_consecutive():
    sol, lessons = run(
        ConstraintSpec(1, "teacher_max_days", {"teacher_ids": [3], "max": 3}, None),
        ConstraintSpec(2, "teacher_max_consecutive", {"teacher_ids": [], "max": 2}, None),
    )
    occ = busy(sol, lessons, "t")
    assert len([d for (t, d), v in occ.items() if t == 3 and v]) <= 3
    for v in occ.values():
        run_len = best = 0
        for p in range(6):
            run_len = run_len + 1 if p in v else 0
            best = max(best, run_len)
        assert best <= 2


def test_class_gaps_and_first_period():
    sol, lessons = run(
        ConstraintSpec(1, "class_max_gaps_day", {"class_ids": [], "max": 0}, None),
        ConstraintSpec(2, "class_first_period", {"class_ids": [], "late_days": 0}, None),
    )
    for v in busy(sol, lessons, "c").values():
        assert 0 in v
        assert max(v) - min(v) + 1 == len(v)


def test_subject_rules():
    sol, lessons = run(
        ConstraintSpec(
            1,
            "subject_forbidden_slots",
            {"subject_ids": [3], "class_ids": [], "slots": [[d, 0] for d in range(5)], "only_doubles": False},
            None,
        ),
        ConstraintSpec(
            2, "subject_not_consecutive_days", {"subject_ids": [1], "class_ids": [2], "wrap": False}, None
        ),
        ConstraintSpec(3, "subjects_not_same_day", {"subject_a": 3, "subject_b": 4, "class_ids": []}, None),
    )
    days = defaultdict(set)
    for pl in sol.placements:
        lesson = lessons[pl.lesson_id]
        if lesson.subject_id == 3:
            assert pl.period != 0
        for c in lesson.class_ids:
            days[(c, lesson.subject_id)].add(pl.day)
    m1b = sorted(days[(2, 1)])
    assert all(b - a > 1 for a, b in zip(m1b, m1b[1:], strict=False))
    assert not (days[(1, 3)] & days[(1, 4)])


def test_soft_constraint_reports_violations():
    # Unmöglich: M 1a hat 4 Stunden, höchstens 0 im ganzen Plan erlaubt -> weich, wird gemeldet
    slots = [[d, p] for d in range(5) for p in range(6)]
    sol, _ = run(
        ConstraintSpec(
            9, "subject_max_in_slots", {"subject_ids": [1], "class_ids": [1], "slots": slots, "max": 0}, 8
        )
    )
    assert sol.report[9] == 4


def test_hard_impossible_is_infeasible_but_relax_works():
    slots = [[d, p] for d in range(5) for p in range(6)]
    spec = ConstraintSpec(
        9, "subject_max_in_slots", {"subject_ids": [1], "class_ids": [1], "slots": slots, "max": 0}, None
    )
    sol = solve(problem([spec]), time_limit=5, workers=4)
    assert not sol.ok
    sol, _ = run(spec, relax=True)
    assert sol.report[9] == 4


@pytest.mark.parametrize("key", sorted(HANDLERS))
def test_each_type_builds_and_solves(key):
    """Jede Bedingungsart mit Standardwerten als weiche Regel: Modell muss lösbar bleiben."""
    from app.constraint_catalog import BY_KEY, validate_params

    defaults = {}
    for prm in BY_KEY[key].params:
        if prm.kind == "subject":
            defaults[prm.name] = 1 if prm.name == "subject_a" else 2
        elif prm.kind == "subjects":
            defaults[prm.name] = [1]
        elif prm.kind == "rooms":
            defaults[prm.name] = [5]
        elif prm.kind == "slots":
            defaults[prm.name] = [[0, 0], [1, 5]]
        elif prm.kind == "period":
            defaults[prm.name] = min(prm.default, 5)
        else:
            defaults[prm.name] = prm.default
    known = {"teachers": {1, 2, 3}, "classes": {1, 2}, "subjects": {1, 2, 3, 4}, "rooms": {5}}
    params = validate_params(key, defaults, 5, 6, known)
    p = problem([ConstraintSpec(1, key, params, 8)])
    p.lessons[0].room_options = [5]
    sol = solve(p, time_limit=5, workers=2)
    assert sol.ok, (key, sol.messages)
    assert 1 in sol.report
