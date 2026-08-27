import { Router } from 'express';
import type { z } from 'zod';
import type { AuditLogRepository } from '../../repositories/auditLogRepository.js';
import type { AppointmentService } from '../../services/appointmentService.js';
import type { AuthService } from '../../services/authService.js';
import type { RetentionService } from '../../services/retentionService.js';
import { auditLogQuery, referenceParams, rescheduleBody } from '../schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';
import { toResponse } from './appointments.js';

interface Deps {
  appointments: AppointmentService;
  auth: AuthService;
  auditLog: AuditLogRepository;
  retention: RetentionService;
  clock: () => Date;
}

/**
 * Staff-facing endpoints: looking up or acting on a customer's booking
 * without the customer needing to be present or verify themselves, and
 * viewing the resulting audit trail. Every action here is logged with the
 * admin's username, the action taken, and the booking reference -- never the
 * customer's personal details, so the log itself doesn't become a new place
 * PII leaks from.
 */
export function adminRouter({ appointments, auth, auditLog, retention, clock }: Deps): Router {
  const router = Router();
  const requireStaff = requireAdmin(auth);

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

  return router;
}
