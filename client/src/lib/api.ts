import { getAdminToken, getAppointmentToken } from './session';
import type { AccessGrant, AnalyticsSummary, AppointmentResponse, BookingInput, Branch, DayAvailability, Service } from './types';

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

  adminLogin: (username: string, password: string) =>
    request<AccessGrant>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  analytics: (rangeDays: number) =>
    request<AnalyticsSummary>(`/analytics/summary?rangeDays=${rangeDays}`, { token: getAdminToken() }),
};
