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
    ("REL", "Religion", "#8b7bd8"),
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
    "REL": ((2, 2, 2, 2), 0, None),
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
    ("LEI", "Leitner Sabine", ["ME", "REL"], 6, []),
    ("EGG", "Egger Florian", ["TEW", "BE"], 6, []),
    ("FUC", "Fuchs Martina", ["BIO", "CH", "M"], 6, []),
    ("SCH", "Schwarz Daniel", ["GSP", "E", "GW"], 6, [[4, p] for p in range(5, 8)]),
    ("BRU", "Brunner Eva", ["REL", "D"], 6, []),
    ("WIM", "Wimmer Stefan", ["DGB", "M", "TEW"], 6, []),
    ("AIG", "Aigner Petra", ["ME", "E"], 5, []),
    ("KOG", "Kogler Lukas", ["BSP", "BE", "TEW"], 6, []),
]

ROOMS = [
    ("TS1", "Turnsaal 1"),
    ("TS2", "Turnsaal 2"),
    ("EDV", "EDV-Raum"),
    ("PHY", "Physiksaal"),
    ("BE", "Zeichensaal"),
    ("MU", "Musiksaal"),
    ("WR", "Werkraum"),
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
        s: models.Teacher(short=s, name=n, max_per_day=mx, unavailable=un) for s, n, _, mx, un in TEACHERS
    }
    qual = {s: subj for s, _, subj, _, _ in TEACHERS}
    rooms = {s: models.Room(short=s, name=n) for s, n in ROOMS}
    classes = {}
    for year in range(1, 5):
        for letter in "ab":
            name = f"{year}{letter}"
            home = models.Room(short=f"K{name}", name=f"Klassenzimmer {name}", capacity=26)
            rooms[home.short] = home
            classes[name] = models.SchoolClass(name=name, home_room=home)
    session.add_all([*subjects.values(), *teachers.values(), *rooms.values(), *classes.values()])

    load = dict.fromkeys(teachers, 0)
    for name, cls in classes.items():
        year = int(name[0])
        for subj, (hours_by_year, doubles, special) in STUNDENTAFEL.items():
            hours = hours_by_year[year - 1]
            if hours == 0:
                continue
            # Lehrkraft mit passendem Fach und geringster Auslastung
            cand = [t for t in teachers if subj in qual[t]]
            teacher = min(cand, key=lambda t: (load[t], t))
            load[teacher] += hours
            if special == "TS":
                lesson_rooms = [rooms["TS1"], rooms["TS2"]]
            elif special:
                lesson_rooms = [rooms[special]]
            else:
                lesson_rooms = []
            session.add(
                models.Lesson(
                    subject=subjects[subj],
                    classes=[cls],
                    teachers=[teachers[teacher]],
                    rooms=lesson_rooms,
                    periods_per_week=hours,
                    double_periods=min(doubles, hours // 2),
                )
            )
    session.commit()
