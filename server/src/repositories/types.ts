import type { OpeningHours } from '../domain/scheduling.js';
import type { LocalDateTime } from '../domain/time.js';

export interface Branch {
  id: number;
  slug: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  slotMinutes: number;
  capacity: number;
  openingHours: OpeningHours;
}

export interface Service {
  id: number;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
}

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

export interface Appointment {
  id: number;
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
  status: AppointmentStatus;
  createdAt: string;
  cancelledAt: string | null;
  anonymisedAt: string | null;
  rescheduledAt: string | null;
  rescheduleCount: number;
}

export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationKind = 'CONFIRMATION' | 'CANCELLATION' | 'RESCHEDULE' | 'REMINDER' | 'OTHER';

export interface Notification {
  id: number;
  appointmentId: number;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
}
