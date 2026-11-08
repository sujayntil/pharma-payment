"""Idempotent, additive column upgrades applied at startup.

``Base.metadata.create_all`` creates new tables (e.g. invoice_events) but
never adds columns to existing ones. These nullable columns are added here
if missing, so a deploy cannot fail on an un-migrated database. Nothing is
dropped, renamed or rewritten. migrations/002_collection_history.sql does the
same with foreign keys for databases migrated by hand.
"""

import logging

from sqlalchemy import inspect, text

log = logging.getLogger(__name__)

_ADDITIVE_COLUMNS = {
    "payments": {
        "recorded_by": "INTEGER",
        "reversal_of_id": "INTEGER",
        "reason": "TEXT",
    },
}


def ensure_additive_columns(engine) -> None:
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        with engine.begin() as conn:
            for table, columns in _ADDITIVE_COLUMNS.items():
                if table not in tables:
                    continue
                existing = {col["name"] for col in inspector.get_columns(table)}
                for name, ddl in columns.items():
                    if name not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                        log.info("Added column %s.%s", table, name)
    except Exception:
        log.exception("Additive schema upgrade failed; run migrations/002_collection_history.sql")
