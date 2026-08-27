import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AppointmentDetails, AppointmentService } from '../../services/appointmentService.js';
import { bookingBody, referenceParams } from '../schemas.js';
import { validate, validated } from '../middleware/validate.js';

interface Deps {
  appointments: AppointmentService;
  /** Disabled in tests */
  rateLimiting: boolean;
}

export function appointmentsRouter({ appointments, rateLimiting }: Deps): Router {
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
        res.status(201).location(`/api/appointments/${details.appointment.reference}`).json(toResponse(details));
      })
      .catch(next);
  });

  router.get('/appointments/:reference', validate('params', referenceParams), (_req, res) => {
    const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
    res.json(toResponse(appointments.get(reference)));
  });

  router.post('/appointments/:reference/cancel', validate('params', referenceParams), (_req, res, next) => {
    const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
    appointments
      .cancel(reference)
      .then((details) => res.json(toResponse(details)))
      .catch(next);
  });

  return router;
}

/**
 * API shape is deliberately decoupled from storage: the ID number is never
 * returned (it is only stored for the branch to verify identity on arrival),
 * and related entities are embedded so the UI needs a single request.
 */
function toResponse({ appointment, branch, service, notifications }: AppointmentDetails) {
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
      branch,
      service,
    },
    notifications: notifications.map((n) => ({
      id: n.id,
      channel: n.channel,
      recipient: n.recipient,
      subject: n.subject,
      body: n.body,
      status: n.status,
      sentAt: n.createdAt,
    })),
  };
}
