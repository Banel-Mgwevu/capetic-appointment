import { NotFoundError, ValidationError } from '../domain/errors.js';
import { computeSlots, type Slot } from '../domain/scheduling.js';
import { addDays, isValidLocalDate, nowInZone, weekdayOf, type LocalDate } from '../domain/time.js';
import type { AppointmentRepository } from '../repositories/appointmentRepository.js';
import type { BranchRepository } from '../repositories/branchRepository.js';
import type { ServiceRepository } from '../repositories/serviceRepository.js';
import type { Branch, Service } from '../repositories/types.js';

export interface BookingPolicy {
  horizonDays: number;
  minLeadMinutes: number;
}

export interface DayAvailability {
  date: LocalDate;
  branchId: number;
  serviceId: number;
  /** False when the branch is closed on this weekday */
  open: boolean;
  slots: Slot[];
}

export interface AvailabilityDeps {
  branches: BranchRepository;
  services: ServiceRepository;
  appointments: AppointmentRepository;
  policy: BookingPolicy;
  clock: () => Date;
}

export class AvailabilityService {
  constructor(private readonly deps: AvailabilityDeps) {}

  getDay(branchId: number, serviceId: number, date: string): DayAvailability {
    const branch = this.deps.branches.findById(branchId);
    if (!branch) throw new NotFoundError('Branch');
    const service = this.deps.services.findById(serviceId);
    if (!service) throw new NotFoundError('Service');

    if (!isValidLocalDate(date)) {
      throw new ValidationError('date must be a valid calendar date in YYYY-MM-DD format');
    }
    this.assertWithinBookingWindow(branch, date);

    return {
      date,
      branchId,
      serviceId,
      open: branch.openingHours[String(weekdayOf(date)) as keyof Branch['openingHours']] !== undefined,
      slots: this.slotsFor(branch, service, date),
    };
  }

  /**
   * Shared with the booking flow so that "what we showed" and "what we accept"
   * are computed by exactly the same rules.
   *
   * `excludeAppointmentId` is used when rescheduling: the appointment being
   * moved still occupies its old slot in the database at the moment of this
   * check, so it must not count against its own new slot's capacity.
   */
  slotsFor(branch: Branch, service: Service, date: LocalDate, excludeAppointmentId?: number): Slot[] {
    const window = branch.openingHours[String(weekdayOf(date)) as keyof Branch['openingHours']];
    if (!window) return [];

    const now = nowInZone(branch.timezone, this.deps.clock());
    let earliestStartMinutes: number | null = null;
    if (date === now.date) earliestStartMinutes = now.minutes + this.deps.policy.minLeadMinutes;

    const existing = this.deps.appointments
      .findConfirmedOnDate(branch.id, date)
      .filter((a) => a.id !== excludeAppointmentId);

    return computeSlots({
      date,
      window,
      slotMinutes: branch.slotMinutes,
      durationMinutes: service.durationMinutes,
      capacity: branch.capacity,
      existing,
      earliestStartMinutes,
    });
  }

  assertWithinBookingWindow(branch: Branch, date: LocalDate): void {
    const today = nowInZone(branch.timezone, this.deps.clock()).date;
    const lastDay = addDays(today, this.deps.policy.horizonDays);
    if (date < today) throw new ValidationError('date is in the past');
    if (date > lastDay) {
      throw new ValidationError(`Appointments can be booked up to ${this.deps.policy.horizonDays} days ahead`);
    }
  }
}
