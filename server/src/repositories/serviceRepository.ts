import type { Db } from '../db/connection.js';
import type { Service } from './types.js';

interface ServiceRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
}

const SELECT = `SELECT id, slug, name, description, duration_minutes FROM services`;

export class ServiceRepository {
  private readonly listStmt;
  private readonly byIdStmt;

  constructor(db: Db) {
    this.listStmt = db.prepare<[], ServiceRow>(`${SELECT} ORDER BY sort_order, name`);
    this.byIdStmt = db.prepare<[number], ServiceRow>(`${SELECT} WHERE id = ?`);
  }

  list(): Service[] {
    return this.listStmt.all().map(toService);
  }

  findById(id: number): Service | undefined {
    const row = this.byIdStmt.get(id);
    return row ? toService(row) : undefined;
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
