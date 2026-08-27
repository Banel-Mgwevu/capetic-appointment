import { addDays, combine } from '../domain/time.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { BranchRepository } from '../repositories/branchRepository.js';
import type { ServiceRepository } from '../repositories/serviceRepository.js';
import type { Notifier } from './notifications/notifier.js';
import { reminderMessages } from './notifications/templates.js';

export interface ReminderServiceDeps {
  appointments: AppointmentRepository;
  branches: BranchRepository;
  services: ServiceRepository;
  notifier: Notifier;
  logger: Logger;
  clock: () => Date;
}

/**
 * Sends a reminder for every confirmed appointment starting "tomorrow" that
 * hasn't already had one. Idempotent: relies on the notifications table
 * (`kind = 'REMINDER'`) rather than a schedule, so running it more often than
 * strictly needed, or after a restart, never double-sends.
 *
 * "Tomorrow" is evaluated in UTC-day terms against the stored local
 * date-times, which is an acceptable approximation for a single-timezone
 * deployment (all branches are Africa/Johannesburg here); a multi-timezone
 * deployment would need to bucket this per branch timezone instead.
 */
export class ReminderService {
  constructor(private readonly deps: ReminderServiceDeps) {}

  /** Runs one sweep. Returns the number of appointments reminded. */
  async sweep(): Promise<number> {
    const today = this.deps.clock().toISOString().slice(0, 10);
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
  }
}
