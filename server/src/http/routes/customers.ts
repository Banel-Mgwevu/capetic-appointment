import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AppointmentService } from '../../services/appointmentService.js';
import type { AuthService } from '../../services/authService.js';
import type { OtpService } from '../../services/otpService.js';
import { otpRequestBody, otpVerifyBody, referenceParams } from '../schemas.js';
import { requireContactAccess } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';

interface Deps {
  appointments: AppointmentService;
  otp: OtpService;
  auth: AuthService;
  rateLimiting: boolean;
}

export function customersRouter({ appointments, otp, auth, rateLimiting }: Deps): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !rateLimiting,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in a while.' } },
  });

  router.post('/customers/otp/request', limiter, validate('body', otpRequestBody), (_req, res) => {
    const { contact } = validated<z.infer<typeof otpRequestBody>>(res, 'body');
    otp.requestCode(contact);
    // Always the same response, whether or not the contact has any bookings,
    // so this endpoint can't be used to check who has an account.
    res.json({ message: 'If that email or phone number has appointments, a code has been sent.' });
  });

  router.post('/customers/otp/verify', limiter, validate('body', otpVerifyBody), (_req, res, next) => {
    try {
      const { contact, code } = validated<z.infer<typeof otpVerifyBody>>(res, 'body');
      const verifiedContact = otp.verifyCode(contact, code);
      res.json(auth.issueContactToken(verifiedContact));
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/appointments', requireContactAccess(auth), (_req, res) => {
    const contact = res.locals.contact as string;
    res.json({ appointments: appointments.listByContact(contact) });
  });

  // Bridges the "my appointments" list into a single booking's own page: the
  // contact was already proven via OTP, so this mints a normal per-booking
  // token instead of asking the customer to re-enter their email or phone.
  router.post(
    '/customers/appointments/:reference/access-token',
    requireContactAccess(auth),
    validate('params', referenceParams),
    (_req, res, next) => {
      try {
        const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
        const contact = res.locals.contact as string;
        res.json(auth.accessAppointment(reference, contact));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
