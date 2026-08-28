import type { Db } from '../db/connection.js';

export interface StaffUser {
  id: number;
  username: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface StaffUserRow {
  id: number;
  username: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  last_login_at: string | null;
}

const SELECT = `SELECT id, username, password_hash, failed_attempts, locked_until, created_at, last_login_at FROM staff_users`;

export class StaffUserRepository {
  private readonly findByUsernameStmt;
  private readonly insertStmt;
  private readonly upsertStmt;
  private readonly countStmt;
  private readonly listStmt;
  private readonly recordFailureStmt;
  private readonly recordSuccessStmt;

  constructor(db: Db) {
    this.findByUsernameStmt = db.prepare<[string], StaffUserRow>(`${SELECT} WHERE username = ?`);
    this.insertStmt = db.prepare<{ username: string; passwordHash: string; createdAt: string }>(`
      INSERT INTO staff_users (username, password_hash, created_at) VALUES (@username, @passwordHash, @createdAt)
    `);
    this.upsertStmt = db.prepare<{ username: string; passwordHash: string; createdAt: string }>(`
      INSERT INTO staff_users (username, password_hash, created_at) VALUES (@username, @passwordHash, @createdAt)
      ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, failed_attempts = 0, locked_until = NULL
    `);
    this.countStmt = db.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM staff_users`);
    this.listStmt = db.prepare<[], StaffUserRow>(`${SELECT} ORDER BY username`);
    this.recordFailureStmt = db.prepare<{ id: number; failedAttempts: number; lockedUntil: string | null }>(`
      UPDATE staff_users SET failed_attempts = @failedAttempts, locked_until = @lockedUntil WHERE id = @id
    `);
    this.recordSuccessStmt = db.prepare<{ id: number; lastLoginAt: string }>(`
      UPDATE staff_users SET failed_attempts = 0, locked_until = NULL, last_login_at = @lastLoginAt WHERE id = @id
    `);
  }

  findByUsername(username: string): StaffUser | undefined {
    const row = this.findByUsernameStmt.get(username);
    return row ? toStaffUser(row) : undefined;
  }

  /** Fails if the username already exists. Used for the CLI's "create" path. */
  insert(username: string, passwordHash: string, createdAt: string): void {
    this.insertStmt.run({ username, passwordHash, createdAt });
  }

  /** Creates the account, or resets its password and unlocks it if the username already exists. */
  upsert(username: string, passwordHash: string, createdAt: string): void {
    this.upsertStmt.run({ username, passwordHash, createdAt });
  }

  count(): number {
    return this.countStmt.get()?.count ?? 0;
  }

  list(): StaffUser[] {
    return this.listStmt.all().map(toStaffUser);
  }

  recordFailedAttempt(id: number, failedAttempts: number, lockedUntil: string | null): void {
    this.recordFailureStmt.run({ id, failedAttempts, lockedUntil });
  }

  recordSuccessfulLogin(id: number, lastLoginAt: string): void {
    this.recordSuccessStmt.run({ id, lastLoginAt });
  }
}

function toStaffUser(row: StaffUserRow): StaffUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
