import type { RequestHandler } from 'express';
import { AppError } from '../../domain/errors.js';
import type { AuthService } from '../../services/authService.js';

export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(401, 'UNAUTHENTICATED', message);
  }
}

function bearerToken(req: { headers: { authorization?: string | undefined } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/**
 * Requires a customer access token scoped to the :reference in the URL.
 * The customer obtained this token from POST /appointments/:reference/access
 * by proving they know the email or phone on the booking.
 */
export function requireAppointmentAccess(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req);
    const reference = (res.locals.params as { reference?: string } | undefined)?.reference ?? req.params.reference;
    if (!token || !reference || !auth.verifyCustomerToken(token, reference)) {
      next(new AuthenticationError('Sign in with your booking reference and contact details to view this appointment.'));
      return;
    }
    next();
  };
}

/** Requires a valid admin session token. Exposes the admin username as res.locals.adminUsername. */
export function requireAdmin(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req);
    const payload = token ? auth.verifyAdminToken(token) : null;
    if (!payload) {
      next(new AuthenticationError('Admin sign-in required.'));
      return;
    }
    res.locals.adminUsername = payload.subject;
    next();
  };
}

/**
 * Requires a contact-session token issued after a verified OTP (see
 * POST /customers/otp/verify). Exposes the verified contact as
 * res.locals.contact for the route to scope its query by.
 */
export function requireContactAccess(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req);
    const contact = token ? auth.verifyContactToken(token) : null;
    if (!contact) {
      next(new AuthenticationError('Verify your email or phone number to view your appointments.'));
      return;
    }
    res.locals.contact = contact;
    next();
  };
}
