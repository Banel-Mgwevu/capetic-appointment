import type { Db } from '../db/connection.js';

export class JobLockRepository {
  private readonly claimStmt;
  private readonly releaseStmt;

  constructor(db: Db) {
    // Atomically claims the lock: succeeds (changes = 1) if no row exists
    // yet for this job, or if the existing row's lock has already expired.
    // Fails (changes = 0) if someone else is currently holding it. SQLite
    // serialises writers, so this can't race even under real concurrency.
    this.claimStmt = db.prepare<[string, string, string]>(`
      INSERT INTO job_locks (job_name, locked_until) VALUES (?, ?)
      ON CONFLICT(job_name) DO UPDATE SET locked_until = excluded.locked_until
      WHERE job_locks.locked_until < ?
    `);
    this.releaseStmt = db.prepare<[string]>(`DELETE FROM job_locks WHERE job_name = ?`);
  }

  /** Returns true if the lock was acquired. */
  tryAcquire(jobName: string, lockedUntil: string, now: string): boolean {
    return this.claimStmt.run(jobName, lockedUntil, now).changes === 1;
  }

  /** Releases early, e.g. right after a successful run, rather than waiting out the full TTL. */
  release(jobName: string): void {
    this.releaseStmt.run(jobName);
  }
}
