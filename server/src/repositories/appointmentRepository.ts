import type { Db } from '../db/connection.js';
import type { LocalDate, LocalDateTime } from '../domain/time.js';
import type { Appointment, AppointmentStatus } from './types.js';

interface AppointmentRow {
  id: number;
  reference: string;
  branch_id: number;
  service_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_id_number: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
  cancelled_at: string | null;
  anonymised_at: string | null;
  rescheduled_at: string | null;
  reschedule_count: number;
}

export interface NewAppointment {
  reference: string;
  branchId: number;
  serviceId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerIdNumber: string | null;
  notes: string | null;
  startsAt: LocalDateTime;
  endsAt: LocalDateTime;
  createdAt: string;
}

const SELECT = `
  SELECT id, reference, branch_id, service_id, customer_name, customer_email, customer_phone,
         customer_id_number, notes, starts_at, ends_at, status, created_at, cancelled_at,
         anonymised_at, rescheduled_at, reschedule_count
  FROM appointments`;

export class AppointmentRepository {
  private readonly insertStmt;
  private readonly byReferenceStmt;
  private readonly byIdStmt;
  private readonly confirmedOnDateStmt;
  private readonly cancelStmt;
  private readonly rescheduleStmt;
  private readonly byContactStmt;
  private readonly anonymisableStmt;
  private readonly anonymiseStmt;
  private readonly dueRemindersStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare<NewAppointment>(`
      INSERT INTO appointments (
        reference, branch_id, service_id, customer_name, customer_email, customer_phone,
        customer_id_number, notes, starts_at, ends_at, status, created_at
      ) VALUES (
        @reference, @branchId, @serviceId, @customerName, @customerEmail, @customerPhone,
        @customerIdNumber, @notes, @startsAt, @endsAt, 'CONFIRMED', @createdAt
      )`);
    this.byReferenceStmt = db.prepare<[string], AppointmentRow>(`${SELECT} WHERE reference = ?`);
    this.byIdStmt = db.prepare<[number], AppointmentRow>(`${SELECT} WHERE id = ?`);
    this.confirmedOnDateStmt = db.prepare<[number, string], AppointmentRow>(
      `${SELECT} WHERE branch_id = ? AND status = 'CONFIRMED' AND substr(starts_at, 1, 10) = ? ORDER BY starts_at`,
    );
    this.cancelStmt = db.prepare<[string, number]>(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status = 'CONFIRMED'`,
    );
    this.rescheduleStmt = db.prepare<[string, string, string, number]>(
      `UPDATE appointments
       SET starts_at = ?, ends_at = ?, rescheduled_at = ?, reschedule_count = reschedule_count + 1
       WHERE id = ? AND status = 'CONFIRMED'`,
    );
    this.byContactStmt = db.prepare<[string, string], AppointmentRow>(
      `${SELECT} WHERE lower(customer_email) = ? OR customer_phone = ? ORDER BY starts_at DESC LIMIT 50`,
    );
    this.anonymisableStmt = db.prepare<[string], AppointmentRow>(
      `${SELECT} WHERE anonymised_at IS NULL AND substr(starts_at, 1, 10) <= ?`,
    );
    this.anonymiseStmt = db.prepare<[string, number]>(
      `UPDATE appointments
       SET customer_name = 'Redacted', customer_email = 'redacted@example.invalid',
           customer_phone = '+27000000000', customer_id_number = NULL, notes = NULL,
           anonymised_at = ?
       WHERE id = ? AND anonymised_at IS NULL`,
    );
    this.dueRemindersStmt = db.prepare<[string, string], AppointmentRow>(
      `${SELECT}
       WHERE status = 'CONFIRMED' AND anonymised_at IS NULL AND starts_at >= ? AND starts_at < ?
       AND id NOT IN (SELECT appointment_id FROM notifications WHERE kind = 'REMINDER')`,
    );
  }

  insert(appointment: NewAppointment): number {
    const result = this.insertStmt.run(appointment);
    return Number(result.lastInsertRowid);
  }

  findByReference(reference: string): Appointment | undefined {
    const row = this.byReferenceStmt.get(reference);
    return row ? toAppointment(row) : undefined;
  }

  findById(id: number): Appointment | undefined {
    const row = this.byIdStmt.get(id);
    return row ? toAppointment(row) : undefined;
  }

  findConfirmedOnDate(branchId: number, date: LocalDate): Appointment[] {
    return this.confirmedOnDateStmt.all(branchId, date).map(toAppointment);
  }

  /** All bookings (any status) whose email or phone matches, most recent first. Contact must already be normalised. */
  findByContact(normalisedContact: string): Appointment[] {
    return this.byContactStmt.all(normalisedContact, normalisedContact).map(toAppointment);
  }

  /** Returns true if the row was cancelled by this call. */
  cancel(id: number, cancelledAt: string): boolean {
    return this.cancelStmt.run(cancelledAt, id).changes === 1;
  }

  /** Returns true if the row was moved to the new time by this call. */
  reschedule(id: number, startsAt: LocalDateTime, endsAt: LocalDateTime, rescheduledAt: string): boolean {
    return this.rescheduleStmt.run(startsAt, endsAt, rescheduledAt, id).changes === 1;
  }

  /** Bookings (any status) starting on or before the given date whose personal data hasn't yet been redacted. */
  findAnonymisable(onOrBeforeDate: LocalDate): Appointment[] {
    return this.anonymisableStmt.all(onOrBeforeDate).map(toAppointment);
  }

  /** Overwrites personal fields in place. Returns true if this call performed the redaction. */
  anonymise(id: number, anonymisedAt: string): boolean {
    return this.anonymiseStmt.run(anonymisedAt, id).changes === 1;
  }

  /** Confirmed appointments starting within [fromInclusive, toExclusive) with no REMINDER sent yet. */
  findDueForReminder(fromInclusive: LocalDateTime, toExclusive: LocalDateTime): Appointment[] {
    return this.dueRemindersStmt.all(fromInclusive, toExclusive).map(toAppointment);
  }
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    reference: row.reference,
    branchId: row.branch_id,
    serviceId: row.service_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerIdNumber: row.customer_id_number,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    anonymisedAt: row.anonymised_at,
    rescheduledAt: row.rescheduled_at,
    rescheduleCount: row.reschedule_count,
  };
}
