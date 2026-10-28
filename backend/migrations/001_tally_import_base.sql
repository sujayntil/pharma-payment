-- Additive production migration for the Tally import and customer assignment base.
-- Run once against a Neon branch/staging database, verify, then apply to production.
-- Safe to rerun. Existing rows remain unchanged and new columns default to NULL.

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS mr_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_customers_mr_id ON customers(mr_id);

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS external_key VARCHAR(160);

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS taxable_amount DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_external_key
    ON invoices(external_key)
    WHERE external_key IS NOT NULL;
