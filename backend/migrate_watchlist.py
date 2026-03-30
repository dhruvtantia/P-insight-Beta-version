"""
migrate_watchlist.py — one-time migration for Watchlist Phase 1
-----------------------------------------------------------------
Adds 3 new columns to the existing 'watchlist' table:
  - tag          VARCHAR(50)  default 'General'
  - sector       VARCHAR(100) nullable
  - target_price REAL         nullable

Run ONCE from the backend directory before restarting the server:
  python migrate_watchlist.py

Safe to re-run: each column is only added if it doesn't already exist.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "p_insight.db")

MIGRATIONS = [
    "ALTER TABLE watchlist ADD COLUMN tag VARCHAR(50) DEFAULT 'General'",
    "ALTER TABLE watchlist ADD COLUMN sector VARCHAR(100)",
    "ALTER TABLE watchlist ADD COLUMN target_price REAL",
]

def get_existing_columns(cursor, table: str) -> set[str]:
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def run():
    if not os.path.exists(DB_PATH):
        print(f"[migrate] DB not found at {DB_PATH}")
        print("[migrate] No migration needed — the DB will be created fresh on next backend start.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    existing = get_existing_columns(cursor, "watchlist")
    print(f"[migrate] Existing watchlist columns: {sorted(existing)}")

    applied = 0
    for stmt in MIGRATIONS:
        # Extract column name from statement
        col_name = stmt.split("ADD COLUMN")[1].strip().split()[0]
        if col_name in existing:
            print(f"[migrate] Skipping '{col_name}' — already exists")
        else:
            cursor.execute(stmt)
            print(f"[migrate] Added column '{col_name}' ✓")
            applied += 1

    conn.commit()
    conn.close()

    if applied == 0:
        print("[migrate] Nothing to do — all columns already exist.")
    else:
        print(f"[migrate] Migration complete — {applied} column(s) added.")


if __name__ == "__main__":
    run()
