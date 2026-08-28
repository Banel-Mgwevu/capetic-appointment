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

export interface NewBranch {
  slug: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  slotMinutes: number;
  capacity: number;
  openingHours: OpeningHours;
}

export type BranchUpdate = Partial<Omit<NewBranch, 'slug'>>;

const SELECT = `SELECT id, slug, name, city, address, timezone, slot_minutes, capacity, opening_hours FROM branches`;

export class BranchRepository {
  private readonly listStmt;
  private readonly byIdStmt;
  private readonly bySlugStmt;
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.listStmt = db.prepare<[], BranchRow>(`${SELECT} ORDER BY city, name`);
    this.byIdStmt = db.prepare<[number], BranchRow>(`${SELECT} WHERE id = ?`);
    this.bySlugStmt = db.prepare<[string], BranchRow>(`${SELECT} WHERE slug = ?`);
    this.insertStmt = db.prepare<{
      slug: string;
      name: string;
      city: string;
      address: string;
      timezone: string;
      slotMinutes: number;
      capacity: number;
      openingHours: string;
    }>(`
      INSERT INTO branches (slug, name, city, address, timezone, slot_minutes, capacity, opening_hours)
      VALUES (@slug, @name, @city, @address, @timezone, @slotMinutes, @capacity, @openingHours)
    `);
  }

  list(): Branch[] {
    return this.listStmt.all().map(toBranch);
  }

  findById(id: number): Branch | undefined {
    const row = this.byIdStmt.get(id);
    return row ? toBranch(row) : undefined;
  }

  findBySlug(slug: string): Branch | undefined {
    const row = this.bySlugStmt.get(slug);
    return row ? toBranch(row) : undefined;
  }

  insert(branch: NewBranch): number {
    return Number(
      this.insertStmt.run({ ...branch, openingHours: JSON.stringify(branch.openingHours) }).lastInsertRowid,
    );
  }

  /** Partial update: only the provided fields change. Returns true if a row was updated. */
  update(id: number, patch: BranchUpdate): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columnFor: Record<string, string> = {
      name: 'name',
      city: 'city',
      address: 'address',
      timezone: 'timezone',
      slotMinutes: 'slot_minutes',
      capacity: 'capacity',
    };
    for (const [key, column] of Object.entries(columnFor)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value);
      }
    }
    if (patch.openingHours !== undefined) {
      fields.push('opening_hours = ?');
      values.push(JSON.stringify(patch.openingHours));
    }
    if (fields.length === 0) return false;

    const sql = `UPDATE branches SET ${fields.join(', ')} WHERE id = ?`;
    return this.db.prepare(sql).run(...values, id).changes === 1;
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
