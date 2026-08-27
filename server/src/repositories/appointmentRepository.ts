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
         customer_id_number, notes, starts_at, ends_at, status, created_at, cancelled_at
  FROM appointments`;

export class AppointmentRepository {
  private readonly insertStmt;
  private readonly byReferenceStmt;
  private readonly confirmedOnDateStmt;
  private readonly cancelStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare<NewAppointment>(`
      INSERT INTO appointments (
        reference, branch_id, service_id, customer_name, customer_email, customer_phone,
        customer_id_number, notes, starts_at, ends_at, status, created_at
      ) VALUES (
        @reference, @branchId, @serviceId, @customerName, @customerEmail, @customerPhone,
        @customerIdNumber, @notes, @startsAt, @endsAt, 'CONFIRMED', @createdAt
      )`);
    this.byReferenceStmt = db.prepare<[string], AppointmentRow>(`${SELECT} WHERE reference = ?`);
    this.confirmedOnDateStmt = db.prepare<[number, string], AppointmentRow>(
      `${SELECT} WHERE branch_id = ? AND status = 'CONFIRMED' AND substr(starts_at, 1, 10) = ? ORDER BY starts_at`,
    );
    this.cancelStmt = db.prepare<[string, number]>(
      `UPDATE appointments SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status = 'CONFIRMED'`,
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

  findConfirmedOnDate(branchId: number, date: LocalDate): Appointment[] {
    return this.confirmedOnDateStmt.all(branchId, date).map(toAppointment);
  }

  /** Returns true if the row was cancelled by this call. */
  cancel(id: number, cancelledAt: string): boolean {
    return this.cancelStmt.run(cancelledAt, id).changes === 1;
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
  };
}
