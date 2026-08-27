import type { Db } from '../db/connection.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { generateReference } from '../domain/reference.js';
import { isValidLocalDateTime, nowInZone, split, type LocalDateTime } from '../domain/time.js';
import type { Logger } from '../logger.js';
import type { AppointmentRepository, NewAppointment } from '../repositories/appointmentRepository.js';
import type { BranchRepository } from '../repositories/branchRepository.js';
import type { ServiceRepository } from '../repositories/serviceRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { Appointment, Branch, Notification, Service } from '../repositories/types.js';
import type { AvailabilityService } from './availabilityService.js';
import type { Notifier, OutboundMessage } from './notifications/notifier.js';
import {
  cancellationMessages,
  confirmationMessages,
  formatLongDate,
  formatTime,
  rescheduleMessages,
} from './notifications/templates.js';

export interface BookingRequest {
  branchId: number;
  serviceId: number;
  startsAt: LocalDateTime;
  customer: {
    name: string;
    email: string;
    phone: string;
    idNumber?: string | undefined;
  };
  notes?: string | undefined;
}

export interface AppointmentDetails {
  appointment: Appointment;
  branch: Branch;
  service: Service;
  notifications: Notification[];
}

export interface AppointmentSummary {
  reference: string;
  status: Appointment['status'];
  startsAt: LocalDateTime;
  endsAt: LocalDateTime;
  branchName: string;
  serviceName: string;
}

export interface AppointmentServiceDeps {
  db: Db;
  branches: BranchRepository;
  services: ServiceRepository;
  appointments: AppointmentRepository;
  notifications: NotificationRepository;
  availability: AvailabilityService;
  notifier: Notifier;
  logger: Logger;
  clock: () => Date;
}

const MAX_REFERENCE_ATTEMPTS = 5;

export class AppointmentService {
  constructor(private readonly deps: AppointmentServiceDeps) {}

  async book(request: BookingRequest): Promise<AppointmentDetails> {
    const branch = this.deps.branches.findById(request.branchId);
    if (!branch) throw new NotFoundError('Branch');
    const service = this.deps.services.findById(request.serviceId);
    if (!service) throw new NotFoundError('Service');

    if (!isValidLocalDateTime(request.startsAt)) {
      throw new ValidationError('startsAt must be a valid local date-time in YYYY-MM-DDTHH:mm format');
    }
    const { date } = split(request.startsAt);
    this.deps.availability.assertWithinBookingWindow(branch, date);

    // The availability check and the insert run inside one transaction.
    // better-sqlite3 executes synchronously and SQLite serialises writers, so
    // two concurrent requests for the last unit of capacity cannot both succeed.
    const reserve = this.deps.db.transaction((): Appointment => {
      const slot = this.deps.availability
        .slotsFor(branch, service, date)
        .find((s) => s.startsAt === request.startsAt);

      if (!slot) {
        throw new ValidationError('startsAt is not a bookable time for this branch and service');
      }
      if (!slot.available) {
        throw new ConflictError('SLOT_UNAVAILABLE', 'That time is no longer available. Please choose another slot.');
      }

      const { reference } = this.insertWithUniqueReference({
        branchId: branch.id,
        serviceId: service.id,
        customerName: request.customer.name,
        customerEmail: request.customer.email,
        customerPhone: request.customer.phone,
        customerIdNumber: request.customer.idNumber ?? null,
        notes: request.notes ?? null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        createdAt: this.deps.clock().toISOString(),
      });

      const created = this.deps.appointments.findByReference(reference);
      if (!created) throw new Error('Appointment vanished after insert');
      return created;
    });

    const appointment = reserve();
    this.deps.logger.info(
      { reference: appointment.reference, branchId: branch.id, serviceId: service.id, startsAt: appointment.startsAt },
      'appointment booked',
    );

    const notifications = await this.dispatch(confirmationMessages(appointment, branch, service));
    return { appointment, branch, service, notifications };
  }

  get(reference: string): AppointmentDetails {
    const appointment = this.deps.appointments.findByReference(reference);
    if (!appointment) throw new NotFoundError('Appointment');
    return this.details(appointment);
  }

  /** All bookings (any status) tied to a contact, most recent first. `contact` must already be normalised. */
  listByContact(normalisedContact: string): AppointmentSummary[] {
    return this.deps.appointments.findByContact(normalisedContact).map((appointment) => ({
      reference: appointment.reference,
      status: appointment.status,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      branchName: this.mustBranch(appointment.branchId).name,
      serviceName: this.mustService(appointment.serviceId).name,
    }));
  }

  async cancel(reference: string): Promise<AppointmentDetails> {
    const appointment = this.deps.appointments.findByReference(reference);
    if (!appointment) throw new NotFoundError('Appointment');
    if (appointment.status === 'CANCELLED') {
      throw new ConflictError('ALREADY_CANCELLED', 'This appointment has already been cancelled.');
    }

    const branch = this.mustBranch(appointment.branchId);
    this.assertNotAlreadyStarted(appointment, branch, 'cancelled');

    const cancelledAt = this.deps.clock().toISOString();
    if (!this.deps.appointments.cancel(appointment.id, cancelledAt)) {
      throw new ConflictError('ALREADY_CANCELLED', 'This appointment has already been cancelled.');
    }
    this.deps.logger.info({ reference }, 'appointment cancelled');

    const updated = { ...appointment, status: 'CANCELLED' as const, cancelledAt };
    const service = this.mustService(updated.serviceId);
    await this.dispatch(cancellationMessages(updated, branch, service));
    return this.details(updated);
  }

  async reschedule(reference: string, newStartsAt: string): Promise<AppointmentDetails> {
    const appointment = this.deps.appointments.findByReference(reference);
    if (!appointment) throw new NotFoundError('Appointment');
    if (appointment.status === 'CANCELLED') {
      throw new ConflictError('ALREADY_CANCELLED', 'This appointment has already been cancelled.');
    }
    if (!isValidLocalDateTime(newStartsAt)) {
      throw new ValidationError('startsAt must be a valid local date-time in YYYY-MM-DDTHH:mm format');
    }

    const branch = this.mustBranch(appointment.branchId);
    const service = this.mustService(appointment.serviceId);
    this.assertNotAlreadyStarted(appointment, branch, 'rescheduled');

    const { date } = split(newStartsAt);
    this.deps.availability.assertWithinBookingWindow(branch, date);

    const previousWhen = `${formatLongDate(appointment.startsAt)} at ${formatTime(appointment.startsAt)}`;

    const move = this.deps.db.transaction((): Appointment => {
      const slot = this.deps.availability
        .slotsFor(branch, service, date, appointment.id)
        .find((s) => s.startsAt === newStartsAt);

      if (!slot) {
        throw new ValidationError('startsAt is not a bookable time for this branch and service');
      }
      if (!slot.available) {
        throw new ConflictError('SLOT_UNAVAILABLE', 'That time is no longer available. Please choose another slot.');
      }

      const rescheduledAt = this.deps.clock().toISOString();
      if (!this.deps.appointments.reschedule(appointment.id, slot.startsAt, slot.endsAt, rescheduledAt)) {
        throw new ConflictError('ALREADY_CANCELLED', 'This appointment can no longer be changed.');
      }

      const updated = this.deps.appointments.findByReference(reference);
      if (!updated) throw new Error('Appointment vanished after reschedule');
      return updated;
    });

    const updated = move();
    this.deps.logger.info({ reference, from: appointment.startsAt, to: updated.startsAt }, 'appointment rescheduled');

    await this.dispatch(rescheduleMessages(updated, branch, service, previousWhen));
    return this.details(updated);
  }

  private assertNotAlreadyStarted(appointment: Appointment, branch: Branch, action: 'cancelled' | 'rescheduled'): void {
    const now = nowInZone(branch.timezone, this.deps.clock());
    const start = split(appointment.startsAt);
    if (start.date < now.date || (start.date === now.date && start.minutes <= now.minutes)) {
      throw new ConflictError('APPOINTMENT_IN_PAST', `Appointments that have already started cannot be ${action}.`);
    }
  }

  private details(appointment: Appointment): AppointmentDetails {
    return {
      appointment,
      branch: this.mustBranch(appointment.branchId),
      service: this.mustService(appointment.serviceId),
      notifications: this.deps.notifications.listForAppointment(appointment.id),
    };
  }

  /**
   * Delivery failures are logged, not surfaced: the booking itself has
   * succeeded and the customer still has their reference on screen.
   */
  private async dispatch(messages: OutboundMessage[]): Promise<Notification[]> {
    const sent: Notification[] = [];
    for (const message of messages) {
      try {
        sent.push(await this.deps.notifier.send(message));
      } catch (error) {
        this.deps.logger.error({ err: error, channel: message.channel }, 'notification delivery failed');
      }
    }
    return sent;
  }

  /** References are random; on the (very rare) collision we simply try again. */
  private insertWithUniqueReference(data: Omit<NewAppointment, 'reference'>): { id: number; reference: string } {
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference();
      try {
        const id = this.deps.appointments.insert({ ...data, reference });
        return { id, reference };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Could not allocate a unique booking reference');
  }

  private mustBranch(id: number): Branch {
    const branch = this.deps.branches.findById(id);
    if (!branch) throw new Error(`Branch ${id} referenced by appointment does not exist`);
    return branch;
  }

  private mustService(id: number): Service {
    const service = this.deps.services.findById(id);
    if (!service) throw new Error(`Service ${id} referenced by appointment does not exist`);
    return service;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}
