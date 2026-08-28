import type { Db } from './connection.js';

interface Migration {
  id: string;
  sql: string;
}

/**
 * Forward-only SQL migrations, applied in order and recorded in
 * `schema_migrations`. Add a new entry to change the schema; never edit an
 * applied one.
 */
const migrations: Migration[] = [
  {
    id: '0001_initial',
    sql: `
      CREATE TABLE branches (
        id             INTEGER PRIMARY KEY,
        slug           TEXT    NOT NULL UNIQUE,
        name           TEXT    NOT NULL,
        city           TEXT    NOT NULL,
        address        TEXT    NOT NULL,
        timezone       TEXT    NOT NULL,
        slot_minutes   INTEGER NOT NULL CHECK (slot_minutes > 0),
        capacity       INTEGER NOT NULL CHECK (capacity > 0),
        opening_hours  TEXT    NOT NULL  -- JSON: { "1": {"open":"09:00","close":"16:30"}, ... }
      );

      CREATE TABLE services (
        id               INTEGER PRIMARY KEY,
        slug             TEXT    NOT NULL UNIQUE,
        name             TEXT    NOT NULL,
        description      TEXT    NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        sort_order       INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE appointments (
        id                 INTEGER PRIMARY KEY,
        reference          TEXT    NOT NULL UNIQUE,
        branch_id          INTEGER NOT NULL REFERENCES branches(id),
        service_id         INTEGER NOT NULL REFERENCES services(id),
        customer_name      TEXT    NOT NULL,
        customer_email     TEXT    NOT NULL,
        customer_phone     TEXT    NOT NULL,
        customer_id_number TEXT,
        notes              TEXT,
        starts_at          TEXT    NOT NULL,  -- branch-local YYYY-MM-DDTHH:mm
        ends_at            TEXT    NOT NULL,
        status             TEXT    NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')),
        created_at         TEXT    NOT NULL,  -- UTC ISO-8601
        cancelled_at       TEXT
      );
      CREATE INDEX idx_appointments_branch_start ON appointments (branch_id, starts_at);

      CREATE TABLE notifications (
        id             INTEGER PRIMARY KEY,
        appointment_id INTEGER NOT NULL REFERENCES appointments(id),
        channel        TEXT    NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
        recipient      TEXT    NOT NULL,
        subject        TEXT,
        body           TEXT    NOT NULL,
        status         TEXT    NOT NULL,
        created_at     TEXT    NOT NULL
      );
      CREATE INDEX idx_notifications_appointment ON notifications (appointment_id);
    `,
  },
  {
    id: '0002_privacy_reschedule_audit',
    sql: `
      -- What kind of message this was, so the reminder job can tell whether one
      -- was already sent, and so an auditor can see the shape of the outbox
      -- without parsing free-text subjects.
      ALTER TABLE notifications ADD COLUMN kind TEXT NOT NULL DEFAULT 'OTHER';

      -- POPIA-aligned data retention: once a booking is old enough that we no
      -- longer need the customer's personal details for the purpose they were
      -- collected for, the fields are overwritten in place rather than the row
      -- deleted, so booking counts and analytics stay accurate.
      ALTER TABLE appointments ADD COLUMN anonymised_at TEXT;
      ALTER TABLE appointments ADD COLUMN rescheduled_at TEXT;
      ALTER TABLE appointments ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0;

      -- One-time codes for the "my appointments" lookup: proves control of an
      -- email or phone number before listing every booking tied to it, since
      -- (unlike a single booking reference) a contact alone isn't a secret.
      CREATE TABLE otp_codes (
        id           INTEGER PRIMARY KEY,
        contact      TEXT    NOT NULL, -- normalised email or E.164 phone
        code_hash    TEXT    NOT NULL,
        attempts     INTEGER NOT NULL DEFAULT 0,
        expires_at   TEXT    NOT NULL,
        consumed_at  TEXT,
        created_at   TEXT    NOT NULL
      );
      CREATE INDEX idx_otp_codes_contact ON otp_codes (contact, created_at);

      -- Audit trail for staff/admin actions only: logins, support lookups of a
      -- customer's booking, and any action taken on a customer's behalf.
      -- Customers acting on their own bookings are already recorded via
      -- appointment status and the notifications table, so those are not
      -- duplicated here.
      CREATE TABLE audit_log (
        id           INTEGER PRIMARY KEY,
        actor        TEXT    NOT NULL, -- admin username
        action       TEXT    NOT NULL, -- e.g. ADMIN_LOGIN_SUCCESS, ADMIN_LOGIN_FAILURE, APPOINTMENT_LOOKUP
        target_type  TEXT,             -- e.g. 'appointment'
        target_id    TEXT,             -- e.g. booking reference
        metadata     TEXT,             -- JSON, small and non-sensitive (no PII)
        ip           TEXT,
        created_at   TEXT    NOT NULL
      );
      CREATE INDEX idx_audit_log_created ON audit_log (created_at);
    `,
  },
  {
    id: '0003_staff_users',
    sql: `
      -- Per-staff login, replacing the single shared admin account. Failed
      -- attempts and a lockout window are tracked per account so the audit
      -- trail attributes actions to a real person, and brute-forcing one
      -- account's password is throttled beyond what the request-rate
      -- limiter alone provides.
      CREATE TABLE staff_users (
        id              INTEGER PRIMARY KEY,
        username        TEXT    NOT NULL UNIQUE,
        password_hash   TEXT    NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until    TEXT,
        created_at      TEXT    NOT NULL,
        last_login_at   TEXT
      );
    `,
  },
  {
    id: '0004_job_locks',
    sql: `
      -- Advisory lock for background jobs (retention/reminder sweeps), so a
      -- manual "run now" trigger can't race the scheduled sweep, and so the
      -- same pattern works unchanged if this ever moves off one SQLite file
      -- per instance onto a real shared database (e.g. Postgres) with
      -- multiple app instances pointed at it.
      CREATE TABLE job_locks (
        job_name     TEXT PRIMARY KEY,
        locked_until TEXT NOT NULL
      );
    `,
  },
];

export function migrate(db: Db): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db
      .prepare<[], { id: string }>('SELECT id FROM schema_migrations')
      .all()
      .map((row) => row.id),
  );

  const applyOne = db.transaction((migration: Migration) => {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
      migration.id,
      new Date().toISOString(),
    );
  });

  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      applyOne(migration);
      newlyApplied.push(migration.id);
    }
  }
  return newlyApplied;
}
