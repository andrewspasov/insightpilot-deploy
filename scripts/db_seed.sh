#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SEED_FIXTURE=${SEED_FIXTURE:-"$ROOT_DIR/backend/fixtures/seed.json"}
PYTHON_BIN=${PYTHON_BIN:-python}

export DB_ENGINE=postgres
export POSTGRES_HOST=${POSTGRES_HOST:-localhost}
export POSTGRES_PORT=${POSTGRES_PORT:-5432}
export POSTGRES_DB=${POSTGRES_DB:-insightpilot}
export POSTGRES_USER=${POSTGRES_USER:-insightpilot}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-insightpilot_dev_pw}

if [[ -f "$SEED_FIXTURE" ]]; then
  "$PYTHON_BIN" "$ROOT_DIR/backend/manage.py" loaddata "$SEED_FIXTURE"
  echo "Seeded from $SEED_FIXTURE"
else
  echo "No seed fixture found at $SEED_FIXTURE. Skipping."
fi
