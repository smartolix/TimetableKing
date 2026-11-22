from collections import defaultdict

from app.solver.cpsat import FixedCard, LessonSpec, PartSpec, Problem, solve


def occupancy_ok(problem: Problem, placements) -> bool:
    lessons = {lesson.id: lesson for lesson in problem.lessons}
    seen = set()
    for pl in placements:
        lesson = lessons[pl.lesson_id]
        for q in range(pl.period, pl.period + pl.length):
            keys = [("t", t, pl.day, q) for t in lesson.teacher_ids]
            keys += [("c", c, pl.day, q) for c in lesson.class_ids]
            for r in pl.rooms.values():
                keys.append(("r", r, pl.day, q))
            for key in keys:
                if key in seen:
                    return False
                seen.add(key)
    return True


def small_problem() -> Problem:
    # 2 Klassen, 3 Lehrkräfte, 1 Turnsaal; Lehrkraft 1 unterrichtet beide Klassen Mathe
    lessons = [
        LessonSpec(1, "M 1a", [1], [1], [10], [1, 1, 1, 1]),
        LessonSpec(2, "M 1b", [2], [1], [11], [1, 1, 1, 1]),
        LessonSpec(3, "D 1a", [1], [2], [10], [2, 1, 1]),
        LessonSpec(4, "D 1b", [2], [2], [11], [2, 1, 1]),
        LessonSpec(5, "BSP 1a+1b", [1, 2], [3], [20], [2]),
        LessonSpec(6, "E 1a", [1], [3], [10], [1, 1, 1]),
        LessonSpec(7, "E 1b", [2], [3], [11], [1, 1, 1]),
    ]
    return Problem(n_days=5, n_periods=6, lessons=lessons, break_after={2})


def test_solves_without_collisions():
    p = small_problem()
    sol = solve(p, time_limit=10, workers=4)
    assert sol.ok, sol.messages
    assert len(sol.placements) == sum(len(lesson.cards) for lesson in p.lessons)
    assert occupancy_ok(p, sol.placements)


def test_doubles_do_not_cross_break_and_spread_over_days():
    p = small_problem()
    sol = solve(p, time_limit=10, workers=4)
    per_lesson_day = defaultdict(int)
    for pl in sol.placements:
        if pl.length == 2:
            assert pl.period != 2  # 2 -> 3 geht über die Pause
        per_lesson_day[(pl.lesson_id, pl.day)] += 1
    assert max(per_lesson_day.values()) == 1


def test_unavailable_and_max_per_day_respected():
    p = small_problem()
    p.teacher_unavailable[1] = {(0, p_) for p_ in range(6)}  # Mo gesperrt
    p.teacher_max_per_day[2] = 2
    sol = solve(p, time_limit=10, workers=4)
    assert sol.ok
    lessons = {lesson.id: lesson for lesson in p.lessons}
    per_day = defaultdict(int)
    for pl in sol.placements:
        if 1 in lessons[pl.lesson_id].teacher_ids:
            assert pl.day != 0
        if 2 in lessons[pl.lesson_id].teacher_ids:
            per_day[pl.day] += pl.length
    assert max(per_day.values()) <= 2


def test_fixed_card_stays():
    p = small_problem()
    p.fixed = [FixedCard(1, 3, 4, 1, {0: 10})]
    sol = solve(p, time_limit=10, workers=4)
    assert sol.ok
    fixed = [pl for pl in sol.placements if pl.locked]
    assert len(fixed) == 1 and (fixed[0].day, fixed[0].period) == (3, 4)


def test_overloaded_teacher_reported_before_solving():
    p = small_problem()
    p.teacher_max_per_day[1] = 1  # 8 Stunden, aber höchstens 5 möglich
    sol = solve(p, time_limit=5)
    assert sol.status == "invalid"
    assert "Lehrkraft #1" in sol.messages[0]


def test_infeasible_detected():
    p = small_problem()
    # 1a darf nur Montag: 11 Stunden passen nicht in 6
    p.class_unavailable[1] = {(d, q) for d in range(1, 5) for q in range(6)}
    sol = solve(p, time_limit=5)
    assert not sol.ok


def test_coupled_parts_run_in_parallel_with_own_rooms():
    # Religion: RK (Lehrkraft 5, Raum 30) und EV (Lehrkraft 6, Raum 31) gleichzeitig für Gruppen-Atome 1 und 2
    # Atome: Klasse 1 = {1, 2}; M für die ganze Klasse
    lessons = [
        LessonSpec(
            1,
            "REL",
            [],
            [],
            [],
            [1, 1],
            parts=[
                PartSpec(10, 7, [5], [1], [30]),
                PartSpec(11, 8, [6], [2], [31, 32]),
            ],
        ),
        LessonSpec(2, "M", [1, 2], [7], [], [1, 1, 1]),
    ]
    p = Problem(
        n_days=5,
        n_periods=4,
        lessons=lessons,
        class_atoms={1: [1, 2]},
        room_unavailable={31: {(d, q) for d in range(5) for q in range(4)}},
    )
    sol = solve(p, time_limit=10, workers=4)
    assert sol.ok, sol.messages
    rel = [pl for pl in sol.placements if pl.lesson_id == 1]
    assert len(rel) == 2
    for pl in rel:
        assert pl.rooms == {10: 30, 11: 32}  # 31 ist immer gesperrt
    assert occupancy_ok(p, sol.placements)


def test_groups_can_have_different_lessons_at_same_time():
    # Klasse 1 geteilt in G1 (Atom 1) und G2 (Atom 2); je 5 Stunden Werken, nur 5 Stunden pro Woche verfügbar
    lessons = [
        LessonSpec(1, "WE G1", [1], [1], [], [1] * 5),
        LessonSpec(2, "WE G2", [2], [2], [], [1] * 5),
    ]
    p = Problem(n_days=5, n_periods=1, lessons=lessons, class_atoms={1: [1, 2]})
    sol = solve(p, time_limit=10, workers=4)
    assert sol.ok, sol.messages
    assert len(sol.placements) == 10
