import type { Db } from '../db/connection.js';
import type { OpeningHours } from '../domain/scheduling.js';
import type { Branch } from './types.js';

interface BranchRow {
  id: number;
  slug: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  slot_minutes: number;
  capacity: number;
  opening_hours: string;
}

const SELECT = `SELECT id, slug, name, city, address, timezone, slot_minutes, capacity, opening_hours FROM branches`;

export class BranchRepository {
  private readonly listStmt;
  private readonly byIdStmt;

  constructor(db: Db) {
    this.listStmt = db.prepare<[], BranchRow>(`${SELECT} ORDER BY city, name`);
    this.byIdStmt = db.prepare<[number], BranchRow>(`${SELECT} WHERE id = ?`);
  }

  list(): Branch[] {
    return this.listStmt.all().map(toBranch);
  }

  findById(id: number): Branch | undefined {
    const row = this.byIdStmt.get(id);
    return row ? toBranch(row) : undefined;
  }
}

function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    address: row.address,
    timezone: row.timezone,
    slotMinutes: row.slot_minutes,
    capacity: row.capacity,
    openingHours: JSON.parse(row.opening_hours) as OpeningHours,
  };
}
