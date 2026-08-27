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
