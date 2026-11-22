#!/usr/bin/env bash
# Bei jedem Start: Datenbank migrieren, Backend und Frontend im Hintergrund starten,
# beim ersten Mal die Beispielschule laden. Protokolle: /tmp/ttk-*.log
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"

echo "Warte auf die Datenbank …"
for _ in $(seq 1 60); do
  if (cd backend && uv run python -c "import os, psycopg; psycopg.connect(os.environ['TTK_DATABASE_URL'].replace('+psycopg', '')).close()") 2>/dev/null; then
    break
  fi
  sleep 1
done
(cd backend && uv run alembic upgrade head)

# Laufende Instanzen aus einem früheren Start beenden
for name in backend frontend; do
  if [ -f "/tmp/ttk-$name.pid" ]; then
    kill -- "-$(cat "/tmp/ttk-$name.pid")" 2>/dev/null || true
    rm -f "/tmp/ttk-$name.pid"
  fi
done

start() {  # name, verzeichnis, befehl …
  local name=$1 dir=$2
  shift 2
  # exec: kein Zwischen-Prozess hält die Ausgabe des Skripts offen; setsid: eigene Prozessgruppe zum Beenden
  (cd "$dir" && exec setsid "$@") > "/tmp/ttk-$name.log" 2>&1 < /dev/null &
  echo $! > "/tmp/ttk-$name.pid"
}
start backend backend uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
start frontend frontend npm run dev -- --host 0.0.0.0 --port 5173

for _ in $(seq 1 60); do
  curl -sf http://localhost:8000/api/health >/dev/null && break
  sleep 1
done
if [ "$(curl -sf http://localhost:8000/api/classes)" = "[]" ]; then
  curl -sf -X POST http://localhost:8000/api/demo >/dev/null && echo "Beispielschule geladen."
fi
echo "TimetableKing läuft auf Port 5173 (Reiter „Ports“). Protokolle: /tmp/ttk-backend.log, /tmp/ttk-frontend.log"
