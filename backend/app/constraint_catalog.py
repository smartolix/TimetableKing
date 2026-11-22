"""Katalog der Bedingungsarten.

Jede Art beschreibt ihre Parameter. Daraus erzeugt das Frontend das Formular, und das Backend prüft damit die Eingaben.
Die Umsetzung im Solver steht in `app/solver/constraints.py` (gleicher Schlüssel).

Parameterarten (kind):
  int       ganze Zahl (min/max)
  period    eine Unterrichtsstunde (0-basiert)
  days      Liste von Wochentagen (0 = Montag)
  slots     Liste von Zeitfenstern [Tag, Stunde]
  bool      ja/nein
  teachers / classes / subjects / rooms   Liste von IDs (leer = alle)
  subject   genau ein Fach
"""

from dataclasses import asdict, dataclass, field
from typing import Any

IMPORTANCE = {"off": 0, "low": 2, "normal": 8, "high": 30, "must": None}  # None = feste Regel
IMPORTANCE_LABEL = {"off": "Aus", "low": "Niedrig", "normal": "Normal", "high": "Hoch", "must": "Muss"}


@dataclass
class Param:
    name: str
    kind: str
    label: str
    default: Any = None
    min: int | None = None
    max: int | None = None
    hint: str = ""
    required: bool = False  # bei Listen: mindestens ein Eintrag


@dataclass
class ConstraintType:
    key: str
    category: str
    title: str
    description: str
    params: list[Param] = field(default_factory=list)


def _teachers() -> Param:
    return Param("teacher_ids", "teachers", "Lehrkräfte", [], hint="Leer = alle Lehrkräfte")


def _classes() -> Param:
    return Param("class_ids", "classes", "Klassen", [], hint="Leer = alle Klassen")


def _subjects(required: bool = True) -> Param:
    return Param("subject_ids", "subjects", "Fächer", [], required=required)


CATALOG: list[ConstraintType] = [
    # ---- Lehrkräfte ----
    ConstraintType(
        "teacher_max_per_day",
        "Lehrkräfte",
        "Höchststunden pro Tag",
        "Eine Lehrkraft unterrichtet an einem Tag höchstens so viele Stunden.",
        [_teachers(), Param("max", "int", "Höchstens", 6, 1, 16)],
    ),
    ConstraintType(
        "teacher_min_per_day",
        "Lehrkräfte",
        "Mindeststunden pro Arbeitstag",
        "Wenn eine Lehrkraft an einem Tag unterrichtet, dann mindestens so viele Stunden.",
        [_teachers(), Param("min", "int", "Mindestens", 2, 1, 16)],
    ),
    ConstraintType(
        "teacher_max_consecutive",
        "Lehrkräfte",
        "Höchstens Stunden in Folge",
        "So viele Stunden darf eine Lehrkraft ohne freie Stunde hintereinander unterrichten.",
        [_teachers(), Param("max", "int", "Höchstens in Folge", 4, 1, 16)],
    ),
    ConstraintType(
        "teacher_max_gaps_day",
        "Lehrkräfte",
        "Hohlstunden pro Tag",
        "Höchstzahl der Hohlstunden (Fenster) pro Tag.",
        [_teachers(), Param("max", "int", "Höchstens", 1, 0, 10)],
    ),
    ConstraintType(
        "teacher_max_gaps_week",
        "Lehrkräfte",
        "Hohlstunden pro Woche",
        "Höchstzahl der Hohlstunden (Fenster) pro Woche.",
        [_teachers(), Param("max", "int", "Höchstens", 3, 0, 40)],
    ),
    ConstraintType(
        "teacher_max_days",
        "Lehrkräfte",
        "Höchstzahl Arbeitstage",
        "Eine Lehrkraft unterrichtet an höchstens so vielen Tagen (egal welchen).",
        [_teachers(), Param("max", "int", "Höchstens Tage", 4, 1, 7)],
    ),
    ConstraintType(
        "teacher_free_day",
        "Lehrkräfte",
        "Freier Tag aus Auswahl",
        "Mindestens einer der gewählten Tage bleibt frei, z. B. „entweder Montag oder Freitag“.",
        [_teachers(), Param("days", "days", "Einer dieser Tage frei", [0, 4], required=True)],
    ),
    ConstraintType(
        "teacher_lunch",
        "Lehrkräfte",
        "Mittagspause",
        "Im Zeitfenster bleibt mindestens eine Stunde frei.",
        [
            _teachers(),
            Param("from_period", "period", "Von Stunde", 4),
            Param("to_period", "period", "Bis Stunde", 6),
        ],
    ),
    ConstraintType(
        "teacher_max_in_slots",
        "Lehrkräfte",
        "Höchstens N Stunden in markierten Zeiten",
        "Zum Beispiel höchstens eine 7. Stunde pro Woche.",
        [
            _teachers(),
            Param("slots", "slots", "Markierte Zeiten", [], required=True),
            Param("max", "int", "Höchstens pro Woche", 1, 0, 40),
        ],
    ),
    ConstraintType(
        "teacher_start_by",
        "Lehrkräfte",
        "Spätester Unterrichtsbeginn",
        "An Arbeitstagen beginnt der Unterricht spätestens in dieser Stunde.",
        [_teachers(), Param("period", "period", "Spätestens ab Stunde", 1)],
    ),
    # ---- Klassen ----
    ConstraintType(
        "class_max_per_day",
        "Klassen",
        "Höchststunden pro Tag",
        "Eine Klasse hat an einem Tag höchstens so viele Stunden.",
        [_classes(), Param("max", "int", "Höchstens", 7, 1, 16)],
    ),
    ConstraintType(
        "class_min_per_day",
        "Klassen",
        "Mindeststunden pro Tag",
        "Eine Klasse hat jeden Tag mindestens so viele Stunden.",
        [_classes(), Param("min", "int", "Mindestens", 4, 1, 16)],
    ),
    ConstraintType(
        "class_max_gaps_day",
        "Klassen",
        "Hohlstunden pro Tag",
        "Höchstzahl der Hohlstunden einer Klasse pro Tag (0 = keine).",
        [_classes(), Param("max", "int", "Höchstens", 0, 0, 10)],
    ),
    ConstraintType(
        "class_first_period",
        "Klassen",
        "Unterricht beginnt in der 1. Stunde",
        "Der Unterricht beginnt in der 1. Stunde. Ein späterer Beginn ist höchstens so oft pro Woche erlaubt.",
        [_classes(), Param("late_days", "int", "Späterer Beginn erlaubt an Tagen", 0, 0, 7)],
    ),
    ConstraintType(
        "class_lunch",
        "Klassen",
        "Mittagspause",
        "Im Zeitfenster bleibt mindestens eine Stunde frei.",
        [
            _classes(),
            Param("from_period", "period", "Von Stunde", 4),
            Param("to_period", "period", "Bis Stunde", 6),
        ],
    ),
    ConstraintType(
        "class_max_in_slots",
        "Klassen",
        "Höchstens N Stunden in markierten Zeiten",
        "Zum Beispiel höchstens ein Nachmittag pro Woche.",
        [
            _classes(),
            Param("slots", "slots", "Markierte Zeiten", [], required=True),
            Param("max", "int", "Höchstens pro Woche", 1, 0, 40),
        ],
    ),
    # ---- Fächer ----
    ConstraintType(
        "subject_max_per_day",
        "Fächer",
        "Höchstens N-mal pro Tag",
        "Die gewählten Fächer zusammen höchstens so oft pro Tag und Klasse (eine Doppelstunde zählt einmal), "
        "z. B. nur eines von Turnen, Kunst und Musik pro Tag.",
        [_subjects(), _classes(), Param("max", "int", "Höchstens pro Tag", 1, 1, 16)],
    ),
    ConstraintType(
        "subject_not_consecutive_days",
        "Fächer",
        "Nicht an aufeinanderfolgenden Tagen",
        "Ein Fach liegt in einer Klasse nicht an zwei Tagen hintereinander.",
        [_subjects(), _classes(), Param("wrap", "bool", "Auch Freitag → Montag", False)],
    ),
    ConstraintType(
        "subject_forbidden_slots",
        "Fächer",
        "Nicht zu bestimmten Zeiten",
        "Die Fächer liegen nicht in den markierten Zeiten, z. B. Turnen nie in der 1. Stunde.",
        [
            _subjects(),
            _classes(),
            Param("slots", "slots", "Verbotene Zeiten", [], required=True),
            Param("only_doubles", "bool", "Nur für Doppelstunden", False),
        ],
    ),
    ConstraintType(
        "subject_max_in_slots",
        "Fächer",
        "Höchstens N Stunden in markierten Zeiten",
        "Zum Beispiel höchstens eine Geschichte-Stunde in der 6./7. Stunde pro Woche und Klasse.",
        [
            _subjects(),
            _classes(),
            Param("slots", "slots", "Markierte Zeiten", [], required=True),
            Param("max", "int", "Höchstens pro Woche", 1, 0, 40),
        ],
    ),
    ConstraintType(
        "subject_edge",
        "Fächer",
        "Erste oder letzte Stunde",
        "Das Fach liegt am Rand des Schultags der Klasse (z. B. für Wahlfächer).",
        [_subjects(), _classes()],
    ),
    ConstraintType(
        "subjects_not_same_day",
        "Fächer",
        "Zwei Fächer nicht am selben Tag",
        "Die beiden Fächer liegen in einer Klasse nicht am selben Tag.",
        [
            Param("subject_a", "subject", "Fach A", required=True),
            Param("subject_b", "subject", "Fach B", required=True),
            _classes(),
        ],
    ),
    ConstraintType(
        "subjects_not_adjacent",
        "Fächer",
        "Zwei Fächer nicht direkt hintereinander",
        "Die beiden Fächer folgen in einer Klasse nicht direkt aufeinander (in keiner Reihenfolge).",
        [
            Param("subject_a", "subject", "Fach A", required=True),
            Param("subject_b", "subject", "Fach B", required=True),
            _classes(),
        ],
    ),
    ConstraintType(
        "subjects_same_day",
        "Fächer",
        "Zwei Fächer am selben Tag",
        "Wenn Fach A an einem Tag liegt, liegt auch Fach B an diesem Tag (pro Klasse).",
        [
            Param("subject_a", "subject", "Fach A", required=True),
            Param("subject_b", "subject", "Fach B", required=True),
            _classes(),
        ],
    ),
    ConstraintType(
        "subject_not_day_after",
        "Fächer",
        "Fach B nicht am Tag nach Fach A",
        "Zum Beispiel Biologie nicht am Tag nach Chemie.",
        [
            Param("subject_a", "subject", "Fach A", required=True),
            Param("subject_b", "subject", "Fach B (nicht am Folgetag)", required=True),
            _classes(),
        ],
    ),
    # ---- Räume ----
    ConstraintType(
        "room_max_days",
        "Räume",
        "Raum an höchstens N Tagen genutzt",
        "Zum Beispiel Turnsaal an höchstens 4 Tagen (für externe Nutzung).",
        [
            Param("room_ids", "rooms", "Räume", [], required=True),
            Param("max", "int", "Höchstens Tage", 4, 0, 7),
        ],
    ),
]

BY_KEY = {c.key: c for c in CATALOG}
CATEGORIES = list(dict.fromkeys(c.category for c in CATALOG))


def catalog_json() -> list[dict]:
    return [asdict(c) for c in CATALOG]


def validate_params(key: str, params: dict, n_days: int, n_periods: int, known: dict[str, set[int]]) -> dict:
    """Prüft und normalisiert die Parameter. Wirft ValueError mit deutscher Meldung."""
    ctype = BY_KEY.get(key)
    if ctype is None:
        raise ValueError(f"Unbekannte Bedingungsart '{key}'")
    out: dict[str, Any] = {}
    for p in ctype.params:
        v = params.get(p.name, p.default)
        if p.kind in ("int", "period"):
            try:
                v = int(v)
            except (TypeError, ValueError):
                raise ValueError(f"{p.label}: Zahl erwartet") from None
            lo = p.min if p.kind == "int" else 0
            hi = p.max if p.kind == "int" else max(0, n_periods - 1)
            if (lo is not None and v < lo) or (hi is not None and v > hi):
                shown = (lo, hi) if p.kind == "int" else (lo + 1, hi + 1)
                raise ValueError(f"{p.label}: Wert muss zwischen {shown[0]} und {shown[1]} liegen")
        elif p.kind == "bool":
            v = bool(v)
        elif p.kind == "days":
            v = sorted({int(x) for x in v or [] if 0 <= int(x) < n_days})
        elif p.kind == "slots":
            v = sorted(
                {(int(a), int(b)) for a, b in v or [] if 0 <= int(a) < n_days and 0 <= int(b) < n_periods}
            )
            v = [list(s) for s in v]
        elif p.kind in ("teachers", "classes", "subjects", "rooms"):
            ids = [int(x) for x in v or []]
            unknown = [x for x in ids if x not in known[p.kind]]
            if unknown:
                raise ValueError(f"{p.label}: unbekannte Einträge {unknown}")
            v = sorted(set(ids))
        elif p.kind == "subject":
            if v is None or int(v) not in known["subjects"]:
                raise ValueError(f"{p.label}: bitte ein Fach wählen")
            v = int(v)
        if p.required and p.kind in ("days", "slots", "teachers", "classes", "subjects", "rooms") and not v:
            raise ValueError(f"{p.label}: mindestens einen Eintrag wählen")
        out[p.name] = v
    if "from_period" in out and "to_period" in out and out["to_period"] < out["from_period"]:
        raise ValueError("„Bis Stunde“ liegt vor „Von Stunde“")
    return out
