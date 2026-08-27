import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AppointmentDetails, AppointmentService } from '../../services/appointmentService.js';
import type { AuthService } from '../../services/authService.js';
import { bookingBody, referenceParams, rescheduleBody } from '../schemas.js';
import { requireAppointmentAccess } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';

interface Deps {
  appointments: AppointmentService;
  auth: AuthService;
  /** Disabled in tests */
  rateLimiting: boolean;
}

export function appointmentsRouter({ appointments, auth, rateLimiting }: Deps): Router {
  const router = Router();

  const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !rateLimiting,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many booking attempts. Please try again later.' } },
  });

  router.post('/appointments', bookingLimiter, validate('body', bookingBody), (req, res, next) => {
    const body = validated<z.infer<typeof bookingBody>>(res, 'body');
    appointments
      .book(body)
      .then((details) => {
        // The customer already proved ownership by creating this booking, so
        // they leave with a session for it -- no separate login step needed
        // until the token expires or they come back later.
        const access = auth.issueAppointmentToken(details.appointment.reference);
        res
          .status(201)
          .location(`/api/appointments/${details.appointment.reference}`)
          .json({ ...toResponse(details), access });
      })
      .catch(next);
  });

  // Proves ownership of a booking by matching the email or phone on file.
  // Looking up by reference alone is not sufficient, since references are
  // shared over email/SMS and could be seen by someone else.
  router.get(
    '/appointments/:reference',
    validate('params', referenceParams),
    requireAppointmentAccess(auth),
    (_req, res) => {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      res.json(toResponse(appointments.get(reference)));
    },
  );

  router.post(
    '/appointments/:reference/cancel',
    validate('params', referenceParams),
    requireAppointmentAccess(auth),
    (_req, res, next) => {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      appointments
        .cancel(reference)
        .then((details) => res.json(toResponse(details)))
        .catch(next);
    },
  );

  router.post(
    '/appointments/:reference/reschedule',
    bookingLimiter,
    validate('params', referenceParams),
    validate('body', rescheduleBody),
    requireAppointmentAccess(auth),
    (_req, res, next) => {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      const { startsAt } = validated<z.infer<typeof rescheduleBody>>(res, 'body');
      appointments
        .reschedule(reference, startsAt)
        .then((details) => res.json(toResponse(details)))
        .catch(next);
    },
  );

  return router;
}

/**
 * API shape is deliberately decoupled from storage: the ID number is never
 * returned (it is only stored for the branch to verify identity on arrival),
 * and related entities are embedded so the UI needs a single request.
 */
export function toResponse({ appointment, branch, service, notifications }: AppointmentDetails) {
  return {
    appointment: {
      reference: appointment.reference,
      status: appointment.status,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      customer: {
        name: appointment.customerName,
        email: appointment.customerEmail,
        phone: appointment.customerPhone,
      },
      notes: appointment.notes,
      createdAt: appointment.createdAt,
      cancelledAt: appointment.cancelledAt,
      rescheduledAt: appointment.rescheduledAt,
      rescheduleCount: appointment.rescheduleCount,
      branch,
      service,
    },
    notifications: notifications.map((n) => ({
      id: n.id,
      channel: n.channel,
      kind: n.kind,
      recipient: n.recipient,
      subject: n.subject,
      body: n.body,
      status: n.status,
      sentAt: n.createdAt,
    })),
  };
}
