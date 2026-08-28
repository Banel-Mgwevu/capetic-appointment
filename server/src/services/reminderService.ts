import { addDays, combine } from '../domain/time.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { BranchRepository } from '../repositories/branchRepository.js';
import type { JobLockRepository } from '../repositories/jobLockRepository.js';
import type { ServiceRepository } from '../repositories/serviceRepository.js';
import type { Notifier } from './notifications/notifier.js';
import { reminderMessages } from './notifications/templates.js';

const LOCK_TTL_MS = 5 * 60 * 1000;

export interface ReminderServiceDeps {
  appointments: AppointmentRepository;
  branches: BranchRepository;
  services: ServiceRepository;
  locks: JobLockRepository;
  notifier: Notifier;
  logger: Logger;
  clock: () => Date;
}

/**
 * Sends a reminder for every confirmed appointment starting "tomorrow" that
 * hasn't already had one. The "already had one" check and the send are not
 * atomic with each other, so two sweeps running concurrently could both pass
 * the check for the same appointment before either records it -- a real
 * double-send race, not just wasted work. The job lock closes that: only one
 * sweep runs at a time, so this matters beyond the idempotency the
 * `notifications` table check already gives against non-overlapping runs.
 *
 * "Tomorrow" is evaluated in UTC-day terms against the stored local
 * date-times, which is an acceptable approximation for a single-timezone
 * deployment (all branches are Africa/Johannesburg here); a multi-timezone
 * deployment would need to bucket this per branch timezone instead.
 */
export class ReminderService {
  constructor(private readonly deps: ReminderServiceDeps) {}

  /** Runs one sweep. Returns the number of appointments reminded, or 0 if another run already holds the lock. */
  async sweep(): Promise<number> {
    const now = this.deps.clock();
    const lockedUntil = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
    if (!this.deps.locks.tryAcquire('reminder', lockedUntil, now.toISOString())) {
      this.deps.logger.info('reminder sweep skipped: already running');
      return 0;
    }

    try {
      const today = now.toISOString().slice(0, 10);
      const tomorrow = addDays(today, 1);
      const dayAfter = addDays(today, 2);

      const due = this.deps.appointments.findDueForReminder(combine(tomorrow, 0), combine(dayAfter, 0));
      let count = 0;
      for (const appointment of due) {
        const branch = this.deps.branches.findById(appointment.branchId);
        const service = this.deps.services.findById(appointment.serviceId);
        if (!branch || !service) continue;

        for (const message of reminderMessages(appointment, branch, service)) {
          try {
            await this.deps.notifier.send(message);
          } catch (error) {
            this.deps.logger.error({ err: error, reference: appointment.reference }, 'reminder delivery failed');
          }
        }
        count += 1;
      }

      if (count > 0) this.deps.logger.info({ count, tomorrow }, 'reminder sweep complete');
      return count;
    } finally {
      this.deps.locks.release('reminder');
    }
  }
}
