import type { Db } from '../db/connection.js';
import type { Service } from './types.js';

interface ServiceRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
}

export interface NewService {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
}

export type ServiceUpdate = Partial<Omit<NewService, 'slug'>>;

const SELECT = `SELECT id, slug, name, description, duration_minutes FROM services`;

export class ServiceRepository {
  private readonly listStmt;
  private readonly byIdStmt;
  private readonly bySlugStmt;
  private readonly nextSortOrderStmt;
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.listStmt = db.prepare<[], ServiceRow>(`${SELECT} ORDER BY sort_order, name`);
    this.byIdStmt = db.prepare<[number], ServiceRow>(`${SELECT} WHERE id = ?`);
    this.bySlugStmt = db.prepare<[string], ServiceRow>(`${SELECT} WHERE slug = ?`);
    this.nextSortOrderStmt = db.prepare<[], { next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM services`,
    );
    this.insertStmt = db.prepare<{
      slug: string;
      name: string;
      description: string;
      durationMinutes: number;
      sortOrder: number;
    }>(`
      INSERT INTO services (slug, name, description, duration_minutes, sort_order)
      VALUES (@slug, @name, @description, @durationMinutes, @sortOrder)
    `);
  }

  list(): Service[] {
    return this.listStmt.all().map(toService);
  }

  findById(id: number): Service | undefined {
    const row = this.byIdStmt.get(id);
    return row ? toService(row) : undefined;
  }

  findBySlug(slug: string): Service | undefined {
    const row = this.bySlugStmt.get(slug);
    return row ? toService(row) : undefined;
  }

  /** New services are appended to the end of the display order. */
  insert(service: NewService): number {
    const sortOrder = this.nextSortOrderStmt.get()?.next ?? 0;
    return Number(this.insertStmt.run({ ...service, sortOrder }).lastInsertRowid);
  }

  /** Partial update: only the provided fields change. Returns true if a row was updated. */
  update(id: number, patch: ServiceUpdate): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.durationMinutes !== undefined) {
      fields.push('duration_minutes = ?');
      values.push(patch.durationMinutes);
    }
    if (fields.length === 0) return false;

    const sql = `UPDATE services SET ${fields.join(', ')} WHERE id = ?`;
    return this.db.prepare(sql).run(...values, id).changes === 1;
  }
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
  };
}
