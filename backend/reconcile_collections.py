"""Find invoices whose paid_amount disagrees with the payments ledger.

Before this fix, Admin "Mark paid / Mark unpaid" changed invoice.paid_amount
without writing a payments row, so collection totals never moved. This
script lists those invoices. Run it against a Neon *branch* first.

    python reconcile_collections.py            # report only (default)
    python reconcile_collections.py --apply    # add "Admin adjustment" rows

--apply writes one ledger row per mismatched invoice, dated now and
recorded by the first Admin, so collection totals match invoice balances.
Because the original dates are unknown, these rows land in today's totals.
"""

import argparse

from sqlalchemy import func

from app import models
from app.collection_info import REVERSAL_MODE
from app.database import SessionLocal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    with SessionLocal() as db:
        ledger = (
            db.query(models.Payment.invoice_id, func.coalesce(func.sum(models.Payment.amount), 0).label("net"))
            .group_by(models.Payment.invoice_id)
            .subquery()
        )
        rows = (
            db.query(models.Invoice, func.coalesce(ledger.c.net, 0))
            .outerjoin(ledger, ledger.c.invoice_id == models.Invoice.id)
            .filter(func.abs(func.coalesce(models.Invoice.paid_amount, 0) - func.coalesce(ledger.c.net, 0)) > 0.01)
            .order_by(models.Invoice.id)
            .all()
        )
        if not rows:
            print("Ledger and invoice balances agree. Nothing to do.")
            return

        print(f"{len(rows)} invoice(s) where paid_amount != sum(payments):")
        total = 0.0
        for invoice, net in rows:
            diff = round((invoice.paid_amount or 0) - float(net), 2)
            total += diff
            print(f"  #{invoice.id:<6} {invoice.invoice_number:<16} status={invoice.status:<8} "
                  f"paid={invoice.paid_amount:>12,.2f} ledger={float(net):>12,.2f} diff={diff:>12,.2f}")
        print(f"Net difference: {total:,.2f}")

        if not args.apply:
            print("\nReport only. Re-run with --apply to write adjustment rows.")
            return

        admin = db.query(models.User).filter(models.User.role == models.RoleEnum.ADMIN.value).order_by(models.User.id).first()
        if not admin:
            raise SystemExit("No Admin user found to attribute adjustments to.")
        for invoice, net in rows:
            diff = round((invoice.paid_amount or 0) - float(net), 2)
            db.add(models.Payment(
                invoice_id=invoice.id,
                amount=diff,
                mode="Admin adjustment" if diff > 0 else REVERSAL_MODE,
                transaction_reference="Backfill of earlier admin status override",
                collected_by=admin.id,
            ))
        db.commit()
        print(f"Wrote {len(rows)} adjustment row(s).")


if __name__ == "__main__":
    main()
