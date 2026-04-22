#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SQLITE_PATH=${SQLITE_PATH:-"$ROOT_DIR/backend/db.sqlite3"}
DUMP_FILE=${DUMP_FILE:-"$ROOT_DIR/backend/fixtures/sqlite_dump.json"}
PYTHON_BIN=${PYTHON_BIN:-python}

export POSTGRES_HOST=${POSTGRES_HOST:-localhost}
export POSTGRES_PORT=${POSTGRES_PORT:-5432}
export POSTGRES_DB=${POSTGRES_DB:-insightpilot}
export POSTGRES_USER=${POSTGRES_USER:-insightpilot}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-insightpilot_dev_pw}

if [[ ! -f "$SQLITE_PATH" ]]; then
  echo "SQLite DB not found at $SQLITE_PATH"
  exit 1
fi

mkdir -p "$(dirname "$DUMP_FILE")"

echo "Dumping SQLite data from $SQLITE_PATH..."
DB_ENGINE=sqlite SQLITE_PATH="$SQLITE_PATH" \
  "$PYTHON_BIN" "$ROOT_DIR/backend/manage.py" dumpdata --indent 2 > "$DUMP_FILE"

echo "Applying migrations to Postgres..."
DB_ENGINE=postgres \
  "$PYTHON_BIN" "$ROOT_DIR/backend/manage.py" migrate

echo "Loading data into Postgres from $DUMP_FILE..."
DB_ENGINE=postgres \
  "$PYTHON_BIN" "$ROOT_DIR/backend/manage.py" loaddata "$DUMP_FILE"

echo "Resetting Postgres sequences..."
DB_ENGINE=postgres \
  "$PYTHON_BIN" "$ROOT_DIR/backend/manage.py" shell -c "from django.apps import apps; from django.db import connection; from django.core.management.color import no_style; sqls = connection.ops.sequence_reset_sql(no_style(), apps.get_models()); cursor = connection.cursor(); [cursor.execute(sql) for sql in sqls]"

echo "Data migration complete."
