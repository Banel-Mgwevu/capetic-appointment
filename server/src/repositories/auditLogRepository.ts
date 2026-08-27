import type { Db } from '../db/connection.js';

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface NewAuditEntry {
  actor: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
  ip: string | null;
  created_at: string;
}

const SELECT = `SELECT id, actor, action, target_type, target_id, metadata, ip, created_at FROM audit_log`;

/**
 * Append-only trail of staff/admin actions: logins, support lookups of a
 * customer's booking, and anything done on a customer's behalf. Never stores
 * PII in `metadata` -- only booking references, counts, and other
 * non-sensitive identifiers, since this log itself is a POPIA-relevant
 * artifact and should not become another place personal data leaks from.
 */
export class AuditLogRepository {
  private readonly insertStmt;
  private readonly recentStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare<{
      actor: string;
      action: string;
      targetType: string | null;
      targetId: string | null;
      metadata: string | null;
      ip: string | null;
      createdAt: string;
    }>(`
      INSERT INTO audit_log (actor, action, target_type, target_id, metadata, ip, created_at)
      VALUES (@actor, @action, @targetType, @targetId, @metadata, @ip, @createdAt)
    `);
    this.recentStmt = db.prepare<[number], AuditRow>(`${SELECT} ORDER BY id DESC LIMIT ?`);
  }

  record(entry: NewAuditEntry): number {
    return Number(
      this.insertStmt.run({
        actor: entry.actor,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ip: entry.ip ?? null,
        createdAt: entry.createdAt,
      }).lastInsertRowid,
    );
  }

  recent(limit: number): AuditEntry[] {
    return this.recentStmt.all(limit).map(toEntry);
  }
}

function toEntry(row: AuditRow): AuditEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata,
    ip: row.ip,
    createdAt: row.created_at,
  };
}
