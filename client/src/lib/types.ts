/** Shapes returned by the API. Kept in sync with server/src/http/routes. */

export type Weekday = '0' | '1' | '2' | '3' | '4' | '5' | '6';

export interface OpeningWindow {
  open: string;
  close: string;
}

export interface Branch {
  id: number;
  slug: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  slotMinutes: number;
  capacity: number;
  openingHours: Partial<Record<Weekday, OpeningWindow>>;
}

export interface Service {
  id: number;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

export interface DayAvailability {
  date: string;
  branchId: number;
  serviceId: number;
  open: boolean;
  slots: Slot[];
}

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

export interface Appointment {
  reference: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  customer: { name: string; email: string; phone: string };
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  branch: Branch;
  service: Service;
}

export interface NotificationRecord {
  id: number;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string;
}

export interface AppointmentResponse {
  appointment: Appointment;
  notifications: NotificationRecord[];
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  idNumber?: string;
}

export interface BookingInput {
  branchId: number;
  serviceId: number;
  startsAt: string;
  customer: CustomerInput;
  notes?: string;
}
