import type { Db } from '../db/connection.js';

export interface Totals {
  confirmed: number;
  cancelled: number;
  total: number;
}

export interface BranchCount {
  branchId: number;
  branchName: string;
  confirmed: number;
  cancelled: number;
}

export interface ServiceCount {
  serviceId: number;
  serviceName: string;
  confirmed: number;
}

export interface DayCount {
  date: string;
  confirmed: number;
  cancelled: number;
}

export interface HourCount {
  hour: string; // "09"
  confirmed: number;
}

/**
 * Every query here is read-only and scoped to what the analytics dashboard
 * needs. Kept separate from AppointmentRepository because these are
 * cross-cutting reporting queries, not per-row CRUD.
 */
export class AnalyticsRepository {
  constructor(private readonly db: Db) {}

  totals(sinceDate: string): Totals {
    const row = this.db
      .prepare<[string], { confirmed: number; cancelled: number }>(
        `SELECT
           SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
         FROM appointments
         WHERE substr(starts_at, 1, 10) >= ?`,
      )
      .get(sinceDate) ?? { confirmed: 0, cancelled: 0 };
    return { confirmed: row.confirmed ?? 0, cancelled: row.cancelled ?? 0, total: (row.confirmed ?? 0) + (row.cancelled ?? 0) };
  }

  byBranch(sinceDate: string): BranchCount[] {
    return this.db
      .prepare<[string], BranchCount>(
        `SELECT
           b.id AS branchId,
           b.name AS branchName,
           SUM(CASE WHEN a.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN a.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
         FROM branches b
         LEFT JOIN appointments a ON a.branch_id = b.id AND substr(a.starts_at, 1, 10) >= ?
         GROUP BY b.id
         ORDER BY confirmed DESC, b.name`,
      )
      .all(sinceDate);
  }

  byService(sinceDate: string): ServiceCount[] {
    return this.db
      .prepare<[string], ServiceCount>(
        `SELECT
           s.id AS serviceId,
           s.name AS serviceName,
           SUM(CASE WHEN a.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed
         FROM services s
         LEFT JOIN appointments a ON a.service_id = s.id AND substr(a.starts_at, 1, 10) >= ?
         GROUP BY s.id
         ORDER BY confirmed DESC, s.name`,
      )
      .all(sinceDate);
  }

  byDay(sinceDate: string): DayCount[] {
    return this.db
      .prepare<[string], DayCount>(
        `SELECT
           substr(starts_at, 1, 10) AS date,
           SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
         FROM appointments
         WHERE substr(starts_at, 1, 10) >= ?
         GROUP BY date
         ORDER BY date`,
      )
      .all(sinceDate);
  }

  byHour(sinceDate: string): HourCount[] {
    return this.db
      .prepare<[string], HourCount>(
        `SELECT
           substr(starts_at, 12, 2) AS hour,
           SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed
         FROM appointments
         WHERE substr(starts_at, 1, 10) >= ?
         GROUP BY hour
         ORDER BY hour`,
      )
      .all(sinceDate);
  }
}
