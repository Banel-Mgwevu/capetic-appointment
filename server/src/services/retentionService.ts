import { addDays, type LocalDate } from '../domain/time.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { JobLockRepository } from '../repositories/jobLockRepository.js';

const LOCK_TTL_MS = 5 * 60 * 1000; // generous for a sweep that should finish in well under a second

export interface RetentionServiceDeps {
  appointments: AppointmentRepository;
  locks: JobLockRepository;
  retentionDays: number;
  logger: Logger;
  clock: () => Date;
}

/**
 * POPIA-aligned data minimisation: once a booking is old enough that we no
 * longer need the customer's personal details for the purpose they were
 * collected for (attending or having attended an appointment), the personal
 * fields are overwritten in place. The row itself, its status, timing, and
 * branch/service associations are kept, so aggregate analytics stay correct
 * indefinitely -- only who it was for is forgotten.
 */
export class RetentionService {
  constructor(private readonly deps: RetentionServiceDeps) {}

  /**
   * Runs one sweep. Returns the number of bookings redacted, or 0 if another
   * run (the scheduled timer, or someone clicking "run purge now") already
   * holds the lock -- this is what stops a manual trigger from double-
   * processing the same rows as a concurrently-running scheduled sweep.
   */
  sweep(): number {
    const now = this.deps.clock();
    const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
    if (!this.deps.locks.tryAcquire('retention', lockedUntil, now.toISOString())) {
      this.deps.logger.info('retention sweep skipped: already running');
      return 0;
    }

    try {
      const today = now.toISOString().slice(0, 10);
      const cutoff: LocalDate = addDays(today, -this.deps.retentionDays);

      const due = this.deps.appointments.findAnonymisable(cutoff);
      if (due.length === 0) return 0;

      const anonymisedAt = this.deps.clock().toISOString();
      let count = 0;
      for (const appointment of due) {
        if (this.deps.appointments.anonymise(appointment.id, anonymisedAt)) count += 1;
      }

      this.deps.logger.info({ count, cutoff, retentionDays: this.deps.retentionDays }, 'data retention sweep complete');
      return count;
    } finally {
      this.deps.locks.release('retention');
    }
  }
}
