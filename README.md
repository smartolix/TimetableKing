# TimetableKing

Stundenplanprogramm für Schulen: Stammdaten erfassen, Stundenplan automatisch berechnen, per Drag & Drop nachbearbeiten, als PDF drucken.

- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL, Alembic
- **Solver:** Google OR-Tools CP-SAT
- **Frontend:** React, TypeScript, Vite, TanStack Query, dnd-kit

## Funktionen

- **Stammdaten:** Zeitraster (mit Pausen), Fächer, Lehrkräfte, Räume, Klassen mit Stammraum
- **Unterricht (Lehrfächerverteilung):** Fach, Klassen, Lehrkräfte, Wochenstunden, Doppelstunden, erlaubte Räume
  - mehrere Klassen = gemeinsamer Unterricht, mehrere Lehrkräfte = Teamteaching
  - ohne Raumangabe wird der Stammraum der Klasse verwendet; bei mehreren Räumen wählt der Solver einen
- **Automatische Planberechnung** im Hintergrund
  - harte Regeln: keine Doppelbelegung von Lehrkraft, Klasse oder Raum, Sperrzeiten, Höchststunden pro Tag, Doppelstunden nicht über Pausen, Stunden eines Unterrichts auf verschiedene Tage verteilt, fixierte Stunden bleiben
  - weiche Regeln (gewichtet): Hohlstunden für Klassen und Lehrkräfte, späte Stunden
  - Vorprüfung mit verständlichen Fehlermeldungen (z. B. „Lehrkraft HUB: 30 Stunden, aber nur 24 mögliche Stunden“)
- **Planansicht** nach Klasse, Lehrkraft oder Raum
  - Drag & Drop; beim Ziehen werden freie Felder grün und Felder mit Konflikt rot markiert
  - Blöcke gleicher Länge tauschen, Raum ändern, Stunden fixieren
  - Konfliktliste; Änderungen mit Konflikt nur nach Bestätigung
  - Neu berechnen, fixierte Stunden bleiben dabei erhalten
- **Excel:** Vorlage, Import (alles oder nichts, mit Zeilennummern bei Fehlern), Export
- **PDF:** Wochenpläne pro Klasse, Lehrkraft oder Raum
- **Beispielschule** (Mittelschule, 8 Klassen, 16 Lehrkräfte) zum Ausprobieren

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
    solver/cpsat.py     Solver (unabhängig von der Datenbank)
    services/
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
- Klassenteilungen und Gruppen (z. B. Religion, Werken in Gruppen)
- weitere weiche Regeln: Unterrichtsbeginn in der 1. Stunde, Mittagspause, Wunschzeiten, Fächer nicht direkt hintereinander
- Mehrere Schulen bzw. Schuljahre
- Fortschrittsanzeige während der Berechnung, Abbrechen einer Berechnung
