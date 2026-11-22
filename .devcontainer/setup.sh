#!/usr/bin/env bash
# Einmalig beim Anlegen des Codespaces: Abhängigkeiten installieren
set -euo pipefail
cd "$(dirname "$0")/.."
pip install --user --quiet uv
export PATH="$HOME/.local/bin:$PATH"
(cd backend && uv sync)
(cd frontend && npm ci)
