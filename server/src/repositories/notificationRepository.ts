import type { Db } from '../db/connection.js';
import type { Notification, NotificationChannel, NotificationKind } from './types.js';

interface NotificationRow {
  id: number;
  appointment_id: number;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
}

export interface NewNotification {
  appointmentId: number;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
}

const SELECT = `SELECT id, appointment_id, channel, kind, recipient, subject, body, status, created_at FROM notifications`;

export class NotificationRepository {
  private readonly insertStmt;
  private readonly byAppointmentStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare<NewNotification>(`
      INSERT INTO notifications (appointment_id, channel, kind, recipient, subject, body, status, created_at)
      VALUES (@appointmentId, @channel, @kind, @recipient, @subject, @body, @status, @createdAt)`);
    this.byAppointmentStmt = db.prepare<[number], NotificationRow>(
      `${SELECT} WHERE appointment_id = ? ORDER BY id`,
    );
  }

  insert(notification: NewNotification): number {
    return Number(this.insertStmt.run(notification).lastInsertRowid);
  }

  listForAppointment(appointmentId: number): Notification[] {
    return this.byAppointmentStmt.all(appointmentId).map(toNotification);
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    channel: row.channel,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
  };
}
