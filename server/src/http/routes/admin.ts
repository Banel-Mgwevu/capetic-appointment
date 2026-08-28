import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AuditLogRepository } from '../../repositories/auditLogRepository.js';
import type { AppointmentService } from '../../services/appointmentService.js';
import type { AuthService } from '../../services/authService.js';
import type { RetentionService } from '../../services/retentionService.js';
import { auditLogQuery, referenceParams, rescheduleBody, staffUserBody } from '../schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';
import { toResponse } from './appointments.js';

interface Deps {
  appointments: AppointmentService;
  auth: AuthService;
  auditLog: AuditLogRepository;
  retention: RetentionService;
  clock: () => Date;
  rateLimiting: boolean;
}

/**
 * Staff-facing endpoints: looking up or acting on a customer's booking
 * without the customer needing to be present or verify themselves, and
 * viewing the resulting audit trail. Every action here is logged with the
 * admin's username, the action taken, and the booking reference -- never the
 * customer's personal details, so the log itself doesn't become a new place
 * PII leaks from.
 */
export function adminRouter({ appointments, auth, auditLog, retention, clock, rateLimiting }: Deps): Router {
  const router = Router();
  const requireStaff = requireAdmin(auth);

  // Creating an account is already gated behind an existing admin session,
  // but still rate-limited: a compromised admin token shouldn't be able to
  // spray new accounts or password resets without limit.
  const staffUserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !rateLimiting,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
  });

  const record = (
    req: { ip?: string | undefined },
    res: { locals: Record<string, unknown> },
    action: string,
    reference: string,
  ): void => {
    auditLog.record({
      actor: res.locals.adminUsername as string,
      action,
      targetType: 'appointment',
      targetId: reference,
      ip: req.ip ?? null,
      createdAt: clock().toISOString(),
    });
  };

  router.get('/admin/appointments/:reference', requireStaff, validate('params', referenceParams), (req, res, next) => {
    try {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      const details = appointments.get(reference);
      record(req, res, 'APPOINTMENT_LOOKUP', reference);
      res.json(toResponse(details));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/admin/appointments/:reference/cancel',
    requireStaff,
    validate('params', referenceParams),
    (req, res, next) => {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      appointments
        .cancel(reference)
        .then((details) => {
          record(req, res, 'APPOINTMENT_CANCELLED_BY_STAFF', reference);
          res.json(toResponse(details));
        })
        .catch(next);
    },
  );

  router.post(
    '/admin/appointments/:reference/reschedule',
    requireStaff,
    validate('params', referenceParams),
    validate('body', rescheduleBody),
    (req, res, next) => {
      const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
      const { startsAt } = validated<z.infer<typeof rescheduleBody>>(res, 'body');
      appointments
        .reschedule(reference, startsAt)
        .then((details) => {
          record(req, res, 'APPOINTMENT_RESCHEDULED_BY_STAFF', reference);
          res.json(toResponse(details));
        })
        .catch(next);
    },
  );

  router.get('/admin/audit-log', requireStaff, validate('query', auditLogQuery), (_req, res) => {
    const { limit } = validated<z.infer<typeof auditLogQuery>>(res, 'query');
    res.json({ entries: auditLog.recent(limit) });
  });

  router.post('/admin/privacy/purge', requireStaff, (req, res) => {
    const count = retention.sweep();
    auditLog.record({
      actor: res.locals.adminUsername as string,
      action: 'PRIVACY_PURGE_TRIGGERED',
      metadata: { redactedCount: count },
      ip: req.ip ?? null,
      createdAt: clock().toISOString(),
    });
    res.json({ redactedCount: count });
  });

  // Lets an already-signed-in admin create the next staff account, or reset
  // one's password, entirely through the app -- no shell/CLI access to the
  // server needed, which matters on platforms (like Render's free tier)
  // that don't offer one.
  router.post(
    '/admin/staff-users',
    requireStaff,
    staffUserLimiter,
    validate('body', staffUserBody),
    (req, res, next) => {
      const { username, password } = validated<z.infer<typeof staffUserBody>>(res, 'body');
      auth
        .createOrResetStaffUser(username, password)
        .then(({ created }) => {
          auditLog.record({
            actor: res.locals.adminUsername as string,
            action: created ? 'STAFF_USER_CREATED' : 'STAFF_USER_PASSWORD_RESET',
            targetType: 'staff_user',
            targetId: username,
            ip: req.ip ?? null,
            createdAt: clock().toISOString(),
          });
          res.status(created ? 201 : 200).json({ username, created });
        })
        .catch(next);
    },
  );

  return router;
}
