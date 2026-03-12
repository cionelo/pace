#!/usr/bin/env python3
"""
pace_migrate.py
Run a SQL migration against the Supabase Postgres database directly.

Usage:
  python3 py/pace_migrate.py --password "your_db_password" --file supabase/migrations/003_add_source_url.sql

The database password is in the Supabase Dashboard under:
  Project Settings -> Database -> Database password
  (or Connection Pooling -> Connection string)
"""

import argparse
import pathlib
import sys

import psycopg2

PROJECT_REF = "zlvtnrtkqfhkjimbpkmp"
DB_HOST = f"db.{PROJECT_REF}.supabase.co"
DB_USER = "postgres"
DB_PORT = 5432
DB_NAME = "postgres"


def main():
    ap = argparse.ArgumentParser(description="Run Supabase migration SQL")
    ap.add_argument("--password", required=True, help="Postgres database password from Supabase dashboard")
    ap.add_argument("--file", default="supabase/migrations/003_add_source_url.sql",
                    help="SQL file to execute")
    args = ap.parse_args()

    sql_path = pathlib.Path(args.file)
    if not sql_path.exists():
        print(f"[err] SQL file not found: {sql_path}")
        sys.exit(1)

    sql = sql_path.read_text()
    print(f"Running migration: {sql_path}")
    print(f"SQL:\n  {sql.strip()}")

    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=args.password,
            dbname=DB_NAME,
            sslmode="require",
        )
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        cur.close()
        conn.close()
        print("[ok] Migration applied successfully.")
    except psycopg2.Error as e:
        print(f"[err] Postgres error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
