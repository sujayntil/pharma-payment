-- Additive migration: collection "recorded by", linked reversals, invoice history log.
-- Safe to rerun. No existing data is changed; new columns default to NULL.
-- Older payments keep recorded_by = NULL and are shown as recorded by their
-- collected_by user, exactly as before. (The API also adds these columns on
-- startup if they are missing -- see app/schema_upgrade.py.)

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS recorded_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reversal_of_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS ix_payments_reversal_of_id ON payments(reversal_of_id);

CREATE TABLE IF NOT EXISTS invoice_events (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    amount DOUBLE PRECISION,
    mode VARCHAR,
    reference VARCHAR,
    reason TEXT,
    actor_id INTEGER REFERENCES users(id),
    actor_role VARCHAR,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invoice_events_id ON invoice_events(id);
CREATE INDEX IF NOT EXISTS ix_invoice_events_invoice_id ON invoice_events(invoice_id);
CREATE INDEX IF NOT EXISTS ix_invoice_events_payment_id ON invoice_events(payment_id);
