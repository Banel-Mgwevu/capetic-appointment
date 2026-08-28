import { getAdminToken, getAppointmentToken, getContactToken } from './session';
import type {
  AccessGrant,
  AnalyticsSummary,
  AppointmentResponse,
  AppointmentSummary,
  AuditEntry,
  Branch,
  BranchInput,
  BranchUpdateInput,
  BookingInput,
  DayAvailability,
  Service,
  ServiceInput,
  ServiceUpdateInput,
} from './types';

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Map of field path → message, for showing errors inline. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: FieldIssue[] };
}

interface RequestOptions extends RequestInit {
  /** Bearer token to attach, when the endpoint requires one. */
  token?: string | null;
}

async function request<T>(path: string, { token, ...init }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // non-JSON error body; fall through with defaults
    }
    throw new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `Request failed (${response.status})`,
      body.error?.details ?? [],
    );
  }
  return (await response.json()) as T;
}

export const api = {
  branches: () => request<{ branches: Branch[] }>('/branches').then((r) => r.branches),
  services: () => request<{ services: Service[] }>('/services').then((r) => r.services),
  availability: (branchId: number, serviceId: number, date: string) =>
    request<DayAvailability>(`/branches/${branchId}/availability?serviceId=${serviceId}&date=${date}`),
  book: (input: BookingInput) => request<AppointmentResponse>('/appointments', { method: 'POST', body: JSON.stringify(input) }),

  /** Prove ownership of a booking with the email or phone on file; returns a short-lived access token. */
  accessAppointment: (reference: string, contact: string) =>
    request<AccessGrant>(`/appointments/${encodeURIComponent(reference)}/access`, {
      method: 'POST',
      body: JSON.stringify({ contact }),
    }),
  appointment: (reference: string) =>
    request<AppointmentResponse>(`/appointments/${encodeURIComponent(reference)}`, {
      token: getAppointmentToken(reference),
    }),
  cancel: (reference: string) =>
    request<AppointmentResponse>(`/appointments/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
      token: getAppointmentToken(reference),
    }),
  reschedule: (reference: string, startsAt: string) =>
    request<AppointmentResponse>(`/appointments/${encodeURIComponent(reference)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startsAt }),
      token: getAppointmentToken(reference),
    }),

  /** "My appointments": OTP-gated lookup of every booking tied to a contact. */
  requestOtp: (contact: string) => request<{ message: string }>('/customers/otp/request', { method: 'POST', body: JSON.stringify({ contact }) }),
  verifyOtp: (contact: string, code: string) =>
    request<AccessGrant>('/customers/otp/verify', { method: 'POST', body: JSON.stringify({ contact, code }) }),
  myAppointments: () =>
    request<{ appointments: AppointmentSummary[] }>('/customers/appointments', { token: getContactToken() }).then(
      (r) => r.appointments,
    ),
  /** Mints a per-booking token from an already-verified contact session, so viewing a booking doesn't ask again. */
  bookingAccessFromContactSession: (reference: string) =>
    request<AccessGrant>(`/customers/appointments/${encodeURIComponent(reference)}/access-token`, {
      method: 'POST',
      token: getContactToken(),
    }),

  adminLogin: (username: string, password: string) =>
    request<AccessGrant>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  analytics: (rangeDays: number) =>
    request<AnalyticsSummary>(`/analytics/summary?rangeDays=${rangeDays}`, { token: getAdminToken() }),

  /** Staff tools: act on a customer's booking without the customer verifying themselves. */
  adminLookupAppointment: (reference: string) =>
    request<AppointmentResponse>(`/admin/appointments/${encodeURIComponent(reference)}`, { token: getAdminToken() }),
  adminCancelAppointment: (reference: string) =>
    request<AppointmentResponse>(`/admin/appointments/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
      token: getAdminToken(),
    }),
  adminRescheduleAppointment: (reference: string, startsAt: string) =>
    request<AppointmentResponse>(`/admin/appointments/${encodeURIComponent(reference)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startsAt }),
      token: getAdminToken(),
    }),
  auditLog: (limit = 50) => request<{ entries: AuditEntry[] }>(`/admin/audit-log?limit=${limit}`, { token: getAdminToken() }).then((r) => r.entries),
  triggerPrivacyPurge: () =>
    request<{ redactedCount: number }>('/admin/privacy/purge', { method: 'POST', token: getAdminToken() }),

  createBranch: (input: BranchInput) =>
    request<Branch>('/admin/branches', { method: 'POST', body: JSON.stringify(input), token: getAdminToken() }),
  updateBranch: (id: number, input: BranchUpdateInput) =>
    request<Branch>(`/admin/branches/${id}`, { method: 'PATCH', body: JSON.stringify(input), token: getAdminToken() }),
  createService: (input: ServiceInput) =>
    request<Service>('/admin/services', { method: 'POST', body: JSON.stringify(input), token: getAdminToken() }),
  updateService: (id: number, input: ServiceUpdateInput) =>
    request<Service>(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify(input), token: getAdminToken() }),
};
