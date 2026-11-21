"""Rebuild an EMPTY database from a "Full backup" file downloaded in the app
(Admin › Backup › Full backup, a .json.gz file).

Always restore into a new, empty database first (for example a new Neon
branch), check it, and only then point the app at it.

    DATABASE_URL=postgresql://...new-empty-db... python restore_backup.py "Pharma full backup 2026-11-22 1400.json.gz"
    python restore_backup.py FILE --check    # read the file only, print row counts

It refuses to write into a database that already has users, customers or
invoices, so a backup can never be mixed into live data.
"""

import argparse
import gzip
import json
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file")
    parser.add_argument("--check", action="store_true", help="only read the file and print row counts")
    args = parser.parse_args()

    with gzip.open(args.file, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    print(f"Backup made {data.get('created_at')} (format v{data.get('version')})")
    for name, n in (data.get("counts") or {}).items():
        print(f"  {name:<28}{n:>8}")
    if args.check:
        return

    from app import models  # noqa: F401  (registers every table)
    from app.backup import restore
    from app.database import Base, engine
    from app.schema_upgrade import ensure_additive_columns

    Base.metadata.create_all(bind=engine)
    ensure_additive_columns(engine)
    try:
        with engine.begin() as conn:
            done = restore(conn, data)
    except ValueError as exc:
        sys.exit(f"Stopped: {exc}")
    for name, n in done.items():
        print(f"Restored {name}: {n}")
    print("Done. Check the totals in the app before switching to this database.")


if __name__ == "__main__":
    main()
