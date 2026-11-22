# TimetableKing

Stundenplanprogramm für Schulen: Stammdaten erfassen, Stundenplan automatisch berechnen, per Drag & Drop nachbearbeiten, als PDF drucken.

- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL, Alembic
- **Solver:** Google OR-Tools CP-SAT
- **Frontend:** React, TypeScript, Vite, TanStack Query, dnd-kit

## Funktionen

- **Stammdaten:** Zeitraster (mit Pausen), Fächer, Lehrkräfte, Räume, Klassen mit Stammraum
- **Klassenteilungen und Gruppen:** z. B. Religion (RK/EV), Gruppen (G1/G2). Gruppen derselben Teilung können gleichzeitig unterschiedlichen Unterricht haben
- **Unterricht (Lehrfächerverteilung)** pro Klasse oder Lehrkraft, mit Ist/Soll-Stunden
  - ein Unterricht hat eine oder mehrere **Zeilen, die gleichzeitig stattfinden (Kopplung)**, z. B. Religion RK und EV parallel in verschiedenen Räumen
  - mehrere Lehrkräfte in einer Zeile = **Teamteaching**
  - Schüler einer Zeile: ganze Klassen und/oder einzelne Gruppen, auch klassenübergreifend (1a RK + 1b RK)
  - „Zeile je Gruppe“ legt für eine Teilung automatisch eine Zeile pro Gruppe an
  - ohne Raumangabe wird der Stammraum verwendet; bei mehreren Räumen wählt der Solver je Zeile einen
- **Zeitwünsche** für Lehrkräfte und Klassen in drei Stufen: frei, unerwünscht (gewichtet vermieden), gesperrt
- **Menü:** Stundenplan · Unterricht · Bedingungen · Stammdaten (Reiter Klassen, Lehrkräfte, Fächer, Räume, Zeitraster) · Import/Export. Die Dialoge von Lehrkräften, Klassen, Fächern und Räumen haben Reiter für Allgemein, Zeitwünsche, Bedingungen und Unterricht
- **Automatische Planberechnung** im Hintergrund
  - harte Regeln: keine Doppelbelegung von Lehrkraft, Klasse oder Raum, Sperrzeiten, Höchststunden pro Tag, Doppelstunden nicht über Pausen, Stunden eines Unterrichts auf verschiedene Tage verteilt, fixierte Stunden bleiben
  - weiche Regeln (gewichtet): Hohlstunden für Klassen und Lehrkräfte, späte Stunden
  - Vorprüfung mit verständlichen Fehlermeldungen (z. B. „Lehrkraft HUB: 30 Stunden, aber nur 24 mögliche Stunden“)
- **Bedingungen** (Menü „Bedingungen“): 26 Bedingungsarten aus einem Katalog auswählen und einstellen, jeweils mit Geltungsbereich (alle oder ausgewählte Lehrkräfte/Klassen/Fächer/Räume), Wichtigkeit (Aus/Niedrig/Normal/Hoch/Muss), Aktiv-Schalter und Notiz
  - Lehrkräfte: Höchst-/Mindeststunden pro Tag, Stunden in Folge, Hohlstunden pro Tag/Woche, Arbeitstage, freier Tag aus Auswahl, Mittagspause, markierte Zeiten, spätester Beginn
  - Klassen: Höchst-/Mindeststunden, Hohlstunden, Beginn in der 1. Stunde, Mittagspause, markierte Zeiten
  - Fächer: N-mal pro Tag, nicht an Folgetagen, verbotene Zeiten (auch nur Doppelstunden), markierte Zeiten, Randstunde, Fächerpaare (nicht/am selben Tag, nicht direkt hintereinander, nicht am Folgetag)
  - Räume: an höchstens N Tagen genutzt
  - nach der Berechnung zeigt ein Bericht, welche Bedingungen wie oft verletzt wurden; „Bedingungen lockern“ erlaubt einen Plan auch dann, wenn „Muss“-Bedingungen nicht alle erfüllbar sind
  - neue Bedingungsarten: Eintrag in `backend/app/constraint_catalog.py` und Umsetzung in `backend/app/solver/constraints.py`
- **Planansicht** nach Klasse, Lehrkraft oder Raum
  - Drag & Drop; beim Ziehen werden freie Felder grün und Felder mit Konflikt rot markiert
  - Blöcke gleicher Länge tauschen, Raum ändern, Stunden fixieren
  - Konfliktliste; Änderungen mit Konflikt nur nach Bestätigung
  - Neu berechnen, fixierte Stunden bleiben dabei erhalten
- **Excel:** Vorlage, Import (alles oder nichts, mit Zeilennummern bei Fehlern), Export; Kopplungen über die Spalte „Nr.“, Gruppen als „1a:RK“, Teilungen als „Religion=RK,EV“
- **PDF:** Wochenpläne pro Klasse, Lehrkraft oder Raum
- **Beispielschule** (Mittelschule, 8 Klassen, 17 Lehrkräfte, Religion als Kopplung, Technik in Gruppen, Teamteaching in Mathe) zum Ausprobieren

## Online ausprobieren (ohne Installation)

[![In GitHub Codespaces öffnen](https://github.com/codespaces/badge.svg)](https://codespaces.new/smartolix/TimetableKing?ref=neuaufbau-python-react)

1. Auf den Knopf klicken (GitHub-Anmeldung nötig) und „Create codespace“ wählen.
2. Beim ersten Mal 3–5 Minuten warten, bis alles installiert ist. Danach öffnet sich TimetableKing in einem neuen Browser-Tab, mit geladener Beispielschule.
   Falls kein Tab aufgeht: unten im Reiter „Ports“ bei Port 5173 auf das Globus-Symbol klicken.
3. Zum Beenden den Codespace unter <https://github.com/codespaces> anhalten oder löschen. Private GitHub-Konten haben ein monatliches Gratiskontingent.

Der Codespace ist privat: Nur du siehst ihn, solange du den Port nicht öffentlich schaltest.

## Schnellstart mit Docker

```bash
docker compose up --build
```

Danach <http://localhost:8080> öffnen, unter **Import/Export** die Beispielschule laden und unter **Pläne** einen Plan berechnen.

## Entwicklung

Voraussetzungen: Python 3.13 mit [uv](https://docs.astral.sh/uv/), Node 22, PostgreSQL 16 (zum Beispiel nur die Datenbank aus Docker: `docker compose up db`).

Backend (Port 8000, API-Doku unter <http://localhost:8000/docs>):

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend (Port 5173, leitet `/api` an das Backend weiter):

```bash
cd frontend
npm install
npm run dev
```

Tests und Prüfungen:

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm run lint && npm run build
```

Die Backend-Tests laufen gegen SQLite im Speicher und brauchen keine Datenbank.

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `TTK_DATABASE_URL` | `postgresql+psycopg://timetable:timetable@localhost:5432/timetableking` | Datenbank |
| `TTK_CORS_ORIGINS` | `["http://localhost:5173"]` | erlaubte Frontend-Adressen |
| `TTK_SOLVER_WORKERS` | `8` | Prozessorkerne für den Solver |
| `TTK_SOLVER_DEFAULT_SECONDS` | `30` | Standard-Rechenzeit |

### Datenbank ändern

Nach Änderungen an `backend/app/models.py`:

```bash
cd backend
uv run alembic revision --autogenerate -m "Beschreibung"
uv run alembic upgrade head
```

## Aufbau

```
backend/
  app/
    models.py           Datenmodell
    schemas.py          API-Schemas (Pydantic)
    constraint_catalog.py  Katalog der Bedingungsarten (Parameter, Texte)
    solver/cpsat.py     Solver (unabhängig von der Datenbank)
    solver/constraints.py  Umsetzung der Bedingungsarten
    services/
      groups.py         Schülergruppen-Atome aus Teilungen
      problem.py        Stammdaten -> Solver-Problem
      runner.py         Berechnung im Hintergrund
      conflicts.py      Konfliktprüfung bei manuellen Änderungen
      excel.py          Excel-Import/-Export
      pdf.py            PDF-Export
      demo.py           Beispielschule
    routers/            API-Endpunkte
  migrations/           Alembic
  tests/
frontend/
  src/
    api.ts, data.ts     API-Client und Datenabfragen
    pages/              Seiten (Pläne, Planansicht, Unterricht, Stammdaten, Zeitraster, Import/Export)
    components/ui.tsx   Dialog, Sperrzeiten-Raster, Mehrfachauswahl
```

## Noch nicht enthalten (mögliche nächste Schritte)

- Benutzerkonten und Rollen (Admin, Lehrkraft, Schüler/Eltern) mit Nur-Lese-Ansicht
- Vertretungsplanung (Abwesenheiten, Vertretungsvorschläge)
- weitere Bedingungsarten aus `docs/bedingungen-katalog.md` (z. B. gleichzeitiger Unterricht, gleiche Stunde jeden Tag, Raumkapazität, Gebäude), Zeitwünsche mit Stufen
- Import aus aSc Stundenplan (`.roz`)
- Mehrere Schulen bzw. Schuljahre
- Fortschrittsanzeige während der Berechnung, Abbrechen einer Berechnung
