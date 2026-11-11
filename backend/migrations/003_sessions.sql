-- Additive migration: ending sessions on log out and on password reset.
-- Safe to rerun. No existing data is changed. (The API also adds the column
-- and creates the table on startup -- see app/schema_upgrade.py.)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMP;

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires_at ON revoked_tokens(expires_at);
