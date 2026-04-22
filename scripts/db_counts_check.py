#!/usr/bin/env python3
import os
import sqlite3
import sys
from collections import OrderedDict

import psycopg


def get_sqlite_counts(db_path: str) -> OrderedDict:
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
        counts = OrderedDict()
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM '{table}'")
            counts[table] = cursor.fetchone()[0]
        return counts
    finally:
        conn.close()


def get_postgres_counts() -> OrderedDict:
    conn = psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        dbname=os.getenv("POSTGRES_DB", "insightpilot"),
        user=os.getenv("POSTGRES_USER", "insightpilot"),
        password=os.getenv("POSTGRES_PASSWORD", "insightpilot_dev_pw"),
    )
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
        )
        tables = [row[0] for row in cursor.fetchall()]
        counts = OrderedDict()
        for table in tables:
            cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
            counts[table] = cursor.fetchone()[0]
        return counts
    finally:
        conn.close()


def main() -> int:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    default_sqlite = os.path.join(root_dir, "backend", "db.sqlite3")
    sqlite_path = os.getenv("SQLITE_PATH", default_sqlite)
    if not os.path.exists(sqlite_path):
        print(f"SQLite DB not found at {sqlite_path}")
        return 1

    sqlite_counts = get_sqlite_counts(sqlite_path)
    pg_counts = get_postgres_counts()

    sqlite_tables = set(sqlite_counts.keys())
    pg_tables = set(pg_counts.keys())

    missing_in_pg = sorted(sqlite_tables - pg_tables)
    missing_in_sqlite = sorted(pg_tables - sqlite_tables)

    if missing_in_pg:
        print("Tables missing in Postgres:")
        for table in missing_in_pg:
            print(f"  - {table}")

    if missing_in_sqlite:
        print("Tables missing in SQLite:")
        for table in missing_in_sqlite:
            print(f"  - {table}")

    common_tables = sorted(sqlite_tables & pg_tables)
    mismatches = []

    for table in common_tables:
        s_count = sqlite_counts[table]
        p_count = pg_counts[table]
        if s_count != p_count:
            mismatches.append((table, s_count, p_count))

    if mismatches:
        print("Row count mismatches:")
        for table, s_count, p_count in mismatches:
            print(f"  - {table}: sqlite={s_count} postgres={p_count}")
        return 2

    print("Row counts match for all common tables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
