# Postgres Migration (Local Dev + Cutover Plan)

## Current default
- SQLite remains the default for safety. Use `DB_ENGINE=postgres` to switch.

## Local dev: Postgres setup
1) Start Postgres:
```
docker compose up -d postgres
```

2) Configure env (either export or add to `backend/.env`):
```
DB_ENGINE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=insightpilot
POSTGRES_USER=insightpilot
POSTGRES_PASSWORD=insightpilot_dev_pw
```
If the backend runs inside Docker on the same compose network, set `POSTGRES_HOST=postgres` instead.

3) Run migrations:
```
PYTHON_BIN=backend/venv/bin/python ./scripts/db_migrate.sh
```

4) (Optional) Seed:
```
PYTHON_BIN=backend/venv/bin/python ./scripts/db_seed.sh
```

## Data migration (SQLite -> Postgres)
This is repeatable and safe for dev data.
```
PYTHON_BIN=backend/venv/bin/python ./scripts/db_data_migrate.sh
```

If you need a custom SQLite file:
```
SQLITE_PATH=/path/to/db.sqlite3 ./scripts/db_data_migrate.sh
```

## Verification checklist (local)
- App boots with `DB_ENGINE=postgres`
- Login / create user
- Create/read tracks, snapshots, settings
- Dashboards render without errors
- Counts match SQLite vs Postgres:
```
backend/venv/bin/python ./scripts/db_counts_check.py
```

## Reset Postgres (local only)
```
./scripts/db_reset.sh
```

## Production cutover plan (outline)
1) Backup current DB (SQLite or MySQL) and store snapshot.
2) Run migration on staging, verify counts.
3) Schedule downtime window (Europe/Skopje timezone).
4) Freeze writes in the app.
5) Run final sync using the data migration script.
6) Switch env vars to Postgres in production.
7) Verify core flows, dashboards, and logs.

## Rollback plan
- Keep old DB snapshot + SQLite file.
- Revert env vars to `DB_ENGINE=sqlite` (or previous DB settings) and redeploy.
- If needed, restore from the snapshot and re-run the app.

## Notes
- Django uses `psycopg` for Postgres. If `psycopg[binary]` fails to install, install `libpq` locally and use `psycopg` without the binary extra.
