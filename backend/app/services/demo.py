"""Beispielschule (Mittelschule mit 8 Klassen) zum Ausprobieren."""

from sqlalchemy.orm import Session

from app import models
from app.services.excel import clear_all
from app.services.problem import get_settings

PERIODS = [
    ("1.", "07:50", "08:40", False),
    ("2.", "08:45", "09:35", True),
    ("3.", "09:55", "10:45", False),
    ("4.", "10:50", "11:40", False),
    ("5.", "11:45", "12:35", False),
    ("6.", "12:40", "13:30", True),
    ("7.", "14:15", "15:05", False),
    ("8.", "15:05", "15:55", False),
]

SUBJECTS = [
    ("D", "Deutsch", "#e5534b"),
    ("M", "Mathematik", "#4f7cff"),
    ("E", "Englisch", "#c678dd"),
    ("GW", "Geografie und Wirtschaft", "#2fa36b"),
    ("GSP", "Geschichte und Politische Bildung", "#b08944"),
    ("BIO", "Biologie", "#57ab5a"),
    ("PH", "Physik", "#3d8fd1"),
    ("CH", "Chemie", "#d4943c"),
    ("BE", "Kunst und Gestaltung", "#e0823d"),
    ("ME", "Musik", "#d65d8f"),
    ("BSP", "Bewegung und Sport", "#2bb5a5"),
    ("RK", "Religion röm.-kath.", "#8b7bd8"),
    ("EV", "Religion evangelisch", "#a38fe0"),
    ("DGB", "Digitale Grundbildung", "#5b6bdc"),
    ("TEW", "Technik und Design", "#9a7b4f"),
]

# Fach: (Stunden je Jahrgang 1–4, Doppelstunden, Fachraum)
STUNDENTAFEL: dict[str, tuple[tuple[int, int, int, int], int, str | None]] = {
    "D": ((4, 4, 4, 4), 0, None),
    "M": ((4, 4, 4, 4), 0, None),
    "E": ((4, 4, 3, 3), 0, None),
    "GW": ((2, 1, 2, 2), 0, None),
    "GSP": ((0, 2, 2, 2), 0, None),
    "BIO": ((2, 2, 1, 2), 0, None),
    "PH": ((0, 1, 2, 2), 0, "PHY"),
    "CH": ((0, 0, 0, 2), 0, "PHY"),
    "BE": ((2, 2, 2, 1), 1, "BE"),
    "ME": ((2, 2, 1, 1), 0, "MU"),
    "BSP": ((4, 4, 3, 3), 1, "TS"),
    "DGB": ((1, 1, 1, 1), 0, "EDV"),
    "TEW": ((2, 2, 2, 1), 1, "WR"),
}

# Kürzel, Name, Fächer, Höchststunden/Tag, gesperrte Zeiten
TEACHERS = [
    ("HUB", "Huber Anna", ["D", "GSP"], 6, [[4, p] for p in range(4, 8)]),
    ("GRU", "Gruber Markus", ["M", "PH"], 6, []),
    ("WAG", "Wagner Lisa", ["E", "D"], 6, [[0, 0], [0, 1]]),
    ("PIC", "Pichler Thomas", ["M", "DGB", "PH"], 6, []),
    ("MOS", "Moser Julia", ["D", "BE"], 5, [[2, p] for p in range(8)]),
    ("STE", "Steiner Paul", ["BSP", "GW"], 6, []),
    ("HOF", "Hofer Katrin", ["BSP", "BIO"], 6, []),
    ("BAU", "Bauer Michael", ["E", "GW"], 6, []),
    ("LEI", "Leitner Sabine", ["ME", "RK"], 6, []),
    ("EGG", "Egger Florian", ["TEW", "BE"], 6, []),
    ("FUC", "Fuchs Martina", ["BIO", "CH", "M"], 6, []),
    ("SCH", "Schwarz Daniel", ["GSP", "E", "GW"], 6, [[4, p] for p in range(5, 8)]),
    ("BRU", "Brunner Eva", ["RK", "D"], 6, []),
    ("WIM", "Wimmer Stefan", ["DGB", "M", "TEW"], 6, []),
    ("AIG", "Aigner Petra", ["ME", "E"], 5, []),
    ("KOG", "Kogler Lukas", ["BSP", "BE", "TEW"], 6, []),
    ("POR", "Porsch Miriam", ["EV"], 4, [[d, p] for d in (0, 1) for p in range(8)]),
]

# Soll-Stunden (Lehrverpflichtung); Teilzeit für HUB und POR
TARGET_HOURS = {"HUB": 14, "POR": 8}

ROOMS = [
    ("TS1", "Turnsaal 1"),
    ("TS2", "Turnsaal 2"),
    ("EDV", "EDV-Raum"),
    ("PHY", "Physiksaal"),
    ("BE", "Zeichensaal"),
    ("MU", "Musiksaal"),
    ("WR", "Werkraum"),
    ("TX", "Textilraum"),
    ("RV", "Religionsraum"),
]


def load_demo(session: Session) -> None:
    clear_all(session)
    settings = get_settings(session)
    settings.school_name = "Mittelschule Beispielstadt"
    settings.days = 5
    session.add_all(
        models.Period(index=i, label=lbl, start=s, end=e, break_after=b)
        for i, (lbl, s, e, b) in enumerate(PERIODS)
    )

    subjects = {s: models.Subject(short=s, name=n, color=c) for s, n, c in SUBJECTS}
    teachers = {
        s: models.Teacher(
            short=s, name=n, max_per_day=mx, unavailable=un, target_hours=TARGET_HOURS.get(s, 22)
        )
        for s, n, _, mx, un in TEACHERS
    }
    qual = {s: subj for s, _, subj, _, _ in TEACHERS}
    rooms = {s: models.Room(short=s, name=n) for s, n in ROOMS}
    classes: dict[str, models.SchoolClass] = {}
    groups: dict[tuple[str, str], models.Group] = {}
    for year in range(1, 5):
        for letter in "ab":
            name = f"{year}{letter}"
            home = models.Room(short=f"K{name}", name=f"Klassenzimmer {name}", capacity=26)
            rooms[home.short] = home
            divisions = []
            for i, (dname, gnames) in enumerate((("Religion", ("RK", "EV")), ("Gruppen", ("G1", "G2")))):
                div = models.Division(name=dname, position=i, groups=[])
                for j, g in enumerate(gnames):
                    groups[(name, g)] = models.Group(name=g, position=j)
                    div.groups.append(groups[(name, g)])
                divisions.append(div)
            classes[name] = models.SchoolClass(name=name, home_room=home, divisions=divisions)
    session.add_all([*subjects.values(), *teachers.values(), *rooms.values(), *classes.values()])

    load = dict.fromkeys(teachers, 0)

    def pick(subj: str, hours: int, exclude: tuple[str, ...] = ()) -> models.Teacher:
        """Lehrkraft mit passendem Fach und geringster Auslastung."""
        cand = [t for t in teachers if subj in qual[t] and t not in exclude]
        t = min(cand, key=lambda x: (load[x], x))
        load[t] += hours
        return teachers[t]

    def part(subj, teacher_list, classes_=(), groups_=(), rooms_=()):
        return models.LessonPart(
            subject=subjects[subj],
            teachers=list(teacher_list),
            classes=list(classes_),
            groups=list(groups_),
            rooms=list(rooms_),
        )

    def add(hours: int, doubles: int, parts: list[models.LessonPart], note: str = "") -> None:
        for i, p in enumerate(parts):
            p.position = i
        session.add(
            models.Lesson(
                periods_per_week=hours, double_periods=min(doubles, hours // 2), parts=parts, note=note
            )
        )

    for name, cls in classes.items():
        year = int(name[0])
        for subj, (hours_by_year, doubles, special) in STUNDENTAFEL.items():
            hours = hours_by_year[year - 1]
            if hours == 0:
                continue
            if special == "TS":
                lesson_rooms = [rooms["TS1"], rooms["TS2"]]
            elif special:
                lesson_rooms = [rooms[special]]
            else:
                lesson_rooms = []
            if subj == "TEW":
                # Technik und Design in Gruppen: G1 im Werkraum, G2 im Textilraum, gleichzeitig
                t1 = pick("TEW", hours)
                t2 = pick("TEW", hours, exclude=(t1.short,))
                add(
                    hours,
                    doubles,
                    [
                        part("TEW", [t1], groups_=[groups[(name, "G1")]], rooms_=[rooms["WR"]]),
                        part("TEW", [t2], groups_=[groups[(name, "G2")]], rooms_=[rooms["TX"]]),
                    ],
                    "Gruppenteilung",
                )
            elif subj == "M" and year == 1:
                # Teamteaching: zwei Lehrkräfte gleichzeitig in der ganzen Klasse
                t1 = pick("M", hours)
                t2 = pick("M", hours, exclude=(t1.short,))
                add(hours, doubles, [part("M", [t1, t2], classes_=[cls])], "Teamteaching")
            else:
                add(hours, doubles, [part(subj, [pick(subj, hours)], classes_=[cls], rooms_=lesson_rooms)])

    # Religion: je Jahrgang a+b gemeinsam, RK und EV gleichzeitig (Kopplung)
    for year in range(1, 5):
        a, b = f"{year}a", f"{year}b"
        add(
            2,
            0,
            [
                part(
                    "RK",
                    [pick("RK", 2)],
                    groups_=[groups[(a, "RK")], groups[(b, "RK")]],
                    rooms_=[rooms[f"K{a}"]],
                ),
                part(
                    "EV",
                    [pick("EV", 2)],
                    groups_=[groups[(a, "EV")], groups[(b, "EV")]],
                    rooms_=[rooms["RV"]],
                ),
            ],
            "Kopplung Religion",
        )
    session.flush()

    sid = {k: v.id for k, v in subjects.items()}
    tid = {k: v.id for k, v in teachers.items()}
    first_period = [[d, 0] for d in range(5)]
    examples = [
        ("teacher_max_consecutive", "normal", {"teacher_ids": [], "max": 4}, ""),
        (
            "teacher_free_day",
            "high",
            {"teacher_ids": [tid["HUB"]], "days": [0, 4]},
            "Teilzeit: Mo oder Fr frei",
        ),
        ("teacher_max_gaps_week", "normal", {"teacher_ids": [], "max": 3}, ""),
        ("class_first_period", "normal", {"class_ids": [], "late_days": 1}, ""),
        ("class_max_gaps_day", "must", {"class_ids": [], "max": 0}, "Keine Hohlstunden für Schüler"),
        (
            "subject_forbidden_slots",
            "high",
            {"subject_ids": [sid["BSP"]], "class_ids": [], "slots": first_period, "only_doubles": False},
            "Kein Turnen in der 1. Stunde",
        ),
        (
            "subject_max_per_day",
            "normal",
            {"subject_ids": [sid["BE"], sid["ME"], sid["TEW"]], "class_ids": [], "max": 1},
            "Höchstens ein kreatives Fach pro Tag",
        ),
        (
            "subject_not_consecutive_days",
            "low",
            {"subject_ids": [sid["GW"], sid["GSP"], sid["BIO"]], "class_ids": [], "wrap": False},
            "",
        ),
        (
            "room_max_days",
            "low",
            {"room_ids": [rooms["TS2"].id], "max": 4},
            "Turnsaal 2 einen Tag für Vereine frei",
        ),
    ]
    session.add_all(
        models.Constraint(type=t, importance=imp, params=params, note=note, position=i + 1)
        for i, (t, imp, params, note) in enumerate(examples)
    )
    session.commit()
