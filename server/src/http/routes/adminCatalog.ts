import { Router } from 'express';
import type { z } from 'zod';
import { omitUndefined } from '../../domain/objects.js';
import { cleanOpeningHours } from '../../domain/scheduling.js';
import { slugify } from '../../domain/slug.js';
import type { AuditLogRepository } from '../../repositories/auditLogRepository.js';
import type { BranchRepository } from '../../repositories/branchRepository.js';
import type { ServiceRepository } from '../../repositories/serviceRepository.js';
import type { AuthService } from '../../services/authService.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';
import { branchCreateBody, branchUpdateBody, idParams, serviceCreateBody, serviceUpdateBody } from '../schemas.js';

interface Deps {
  branches: BranchRepository;
  services: ServiceRepository;
  auth: AuthService;
  auditLog: AuditLogRepository;
  clock: () => Date;
}

/**
 * Staff-facing catalog management: branches and services are seed data with
 * no admin UI otherwise, which means changing opening hours or adding a
 * branch would require a code change and redeploy. This lets staff do it
 * through the app instead, same audit-logging pattern as everything else
 * under /admin.
 */
export function adminCatalogRouter({ branches, services, auth, auditLog, clock }: Deps): Router {
  const router = Router();
  const requireStaff = requireAdmin(auth);

  const record = (req: { ip?: string | undefined }, res: { locals: Record<string, unknown> }, action: string, targetId: string): void => {
    auditLog.record({
      actor: res.locals.adminUsername as string,
      action,
      targetType: action.startsWith('BRANCH') ? 'branch' : 'service',
      targetId,
      ip: req.ip ?? null,
      createdAt: clock().toISOString(),
    });
  };

  /** Appends -2, -3, ... until the slug is free. Branch/service catalogs are small, so this is never more than a handful of tries. */
  function uniqueSlug(name: string, findBySlug: (slug: string) => unknown): string {
    const base = slugify(name);
    let candidate = base;
    let suffix = 2;
    while (findBySlug(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  router.post('/admin/branches', requireStaff, validate('body', branchCreateBody), (req, res) => {
    const body = validated<z.infer<typeof branchCreateBody>>(res, 'body');
    const slug = uniqueSlug(body.name, (s) => branches.findBySlug(s));
    const id = branches.insert({ ...body, openingHours: cleanOpeningHours(body.openingHours), slug, timezone: 'Africa/Johannesburg' });
    record(req, res, 'BRANCH_CREATED', slug);
    res.status(201).json(branches.findById(id));
  });

  router.patch(
    '/admin/branches/:id',
    requireStaff,
    validate('params', idParams),
    validate('body', branchUpdateBody),
    (req, res) => {
      const { id } = validated<z.infer<typeof idParams>>(res, 'params');
      const body = validated<z.infer<typeof branchUpdateBody>>(res, 'body');
      const branch = branches.findById(id);
      if (!branch) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Branch not found' } });
        return;
      }
      const { openingHours: rawOpeningHours, ...rest } = body;
      const patch = {
        ...omitUndefined(rest),
        ...(rawOpeningHours ? { openingHours: cleanOpeningHours(rawOpeningHours) } : {}),
      };
      branches.update(id, patch);
      record(req, res, 'BRANCH_UPDATED', branch.slug);
      res.json(branches.findById(id));
    },
  );

  router.post('/admin/services', requireStaff, validate('body', serviceCreateBody), (req, res) => {
    const body = validated<z.infer<typeof serviceCreateBody>>(res, 'body');
    const slug = uniqueSlug(body.name, (s) => services.findBySlug(s));
    const id = services.insert({ ...body, slug });
    record(req, res, 'SERVICE_CREATED', slug);
    res.status(201).json(services.findById(id));
  });

  router.patch(
    '/admin/services/:id',
    requireStaff,
    validate('params', idParams),
    validate('body', serviceUpdateBody),
    (req, res) => {
      const { id } = validated<z.infer<typeof idParams>>(res, 'params');
      const body = validated<z.infer<typeof serviceUpdateBody>>(res, 'body');
      const service = services.findById(id);
      if (!service) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
        return;
      }
      services.update(id, omitUndefined(body));
      record(req, res, 'SERVICE_UPDATED', service.slug);
      res.json(services.findById(id));
    },
  );

  return router;
}
