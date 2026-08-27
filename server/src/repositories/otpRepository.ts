import type { Db } from '../db/connection.js';

export interface NewOtp {
  contact: string;
  codeHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface OtpRecord {
  id: number;
  contact: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

interface OtpRow {
  id: number;
  contact: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

const SELECT = `SELECT id, contact, code_hash, attempts, expires_at, consumed_at, created_at FROM otp_codes`;

export class OtpRepository {
  private readonly insertStmt;
  private readonly latestActiveStmt;
  private readonly incrementAttemptsStmt;
  private readonly consumeStmt;
  private readonly invalidateActiveStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare<NewOtp>(`
      INSERT INTO otp_codes (contact, code_hash, expires_at, created_at)
      VALUES (@contact, @codeHash, @expiresAt, @createdAt)
    `);
    this.latestActiveStmt = db.prepare<[string], OtpRow>(
      `${SELECT} WHERE contact = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`,
    );
    this.incrementAttemptsStmt = db.prepare<[number]>(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`);
    this.consumeStmt = db.prepare<[string, number]>(`UPDATE otp_codes SET consumed_at = ? WHERE id = ?`);
    this.invalidateActiveStmt = db.prepare<[string]>(
      `UPDATE otp_codes SET consumed_at = created_at WHERE contact = ? AND consumed_at IS NULL`,
    );
  }

  /** A fresh request supersedes any earlier unconsumed code for the same contact. */
  create(otp: NewOtp): number {
    this.invalidateActiveStmt.run(otp.contact);
    return Number(this.insertStmt.run(otp).lastInsertRowid);
  }

  findLatestActive(contact: string): OtpRecord | undefined {
    const row = this.latestActiveStmt.get(contact);
    return row ? toRecord(row) : undefined;
  }

  incrementAttempts(id: number): void {
    this.incrementAttemptsStmt.run(id);
  }

  consume(id: number, consumedAt: string): void {
    this.consumeStmt.run(consumedAt, id);
  }
}

function toRecord(row: OtpRow): OtpRecord {
  return {
    id: row.id,
    contact: row.contact,
    codeHash: row.code_hash,
    attempts: row.attempts,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}
