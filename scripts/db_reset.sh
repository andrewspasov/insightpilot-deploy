#!/usr/bin/env bash
set -euo pipefail

export POSTGRES_DB=${POSTGRES_DB:-insightpilot}
export POSTGRES_USER=${POSTGRES_USER:-insightpilot}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-insightpilot_dev_pw}

# Ensure Postgres is up before attempting reset
if command -v docker >/dev/null 2>&1; then
  docker compose up -d postgres
else
  echo "Docker not found. Please start Postgres and retry."
  exit 1
fi

# Reset schema to a clean state (does not touch SQLite)
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v owner="$POSTGRES_USER" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO :"owner";
GRANT ALL ON SCHEMA public TO public;
SQL

echo "Postgres schema reset complete."
