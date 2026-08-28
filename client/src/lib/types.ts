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

export interface BranchInput {
  name: string;
  city: string;
  address: string;
  slotMinutes: number;
  capacity: number;
  openingHours: Partial<Record<Weekday, OpeningWindow>>;
}

export type BranchUpdateInput = Partial<BranchInput>;

export interface ServiceInput {
  name: string;
  description: string;
  durationMinutes: number;
}

export type ServiceUpdateInput = Partial<ServiceInput>;

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
  rescheduledAt: string | null;
  rescheduleCount: number;
  branch: Branch;
  service: Service;
}

export interface NotificationRecord {
  id: number;
  channel: 'EMAIL' | 'SMS';
  kind: 'CONFIRMATION' | 'CANCELLATION' | 'RESCHEDULE' | 'REMINDER' | 'OTHER';
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string;
}

export interface AppointmentResponse {
  appointment: Appointment;
  notifications: NotificationRecord[];
  /** Only present on the response to a fresh booking */
  access?: AccessGrant;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  idNumber?: string;
}

export interface AccessGrant {
  token: string;
  expiresInSeconds: number;
}

export interface AnalyticsSummary {
  rangeDays: number;
  since: string;
  totals: { confirmed: number; cancelled: number; total: number; cancellationRate: number };
  byBranch: { branchId: number; branchName: string; confirmed: number; cancelled: number }[];
  byService: { serviceId: number; serviceName: string; confirmed: number }[];
  byDay: { date: string; confirmed: number; cancelled: number }[];
  byHour: { hour: string; confirmed: number }[];
  busiestBranch: string | null;
  busiestService: string | null;
  busiestHour: string | null;
}

export interface BookingInput {
  branchId: number;
  serviceId: number;
  startsAt: string;
  customer: CustomerInput;
  notes?: string;
  consent: boolean;
}

export interface AppointmentSummary {
  reference: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  branchName: string;
  serviceName: string;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}
