import { Router } from 'express';
import type { BranchRepository } from '../../repositories/branchRepository.js';
import type { ServiceRepository } from '../../repositories/serviceRepository.js';
import type { AvailabilityService } from '../../services/availabilityService.js';
import { availabilityParams, availabilityQuery } from '../schemas.js';
import { validate, validated } from '../middleware/validate.js';
import type { z } from 'zod';

interface Deps {
  branches: BranchRepository;
  services: ServiceRepository;
  availability: AvailabilityService;
}

export function referenceDataRouter({ branches, services, availability }: Deps): Router {
  const router = Router();

  router.get('/branches', (_req, res) => {
    res.json({ branches: branches.list() });
  });

  router.get('/services', (_req, res) => {
    res.json({ services: services.list() });
  });

  router.get(
    '/branches/:branchId/availability',
    validate('params', availabilityParams),
    validate('query', availabilityQuery),
    (_req, res) => {
      const { branchId } = validated<z.infer<typeof availabilityParams>>(res, 'params');
      const { serviceId, date } = validated<z.infer<typeof availabilityQuery>>(res, 'query');
      res.json(availability.getDay(branchId, serviceId, date));
    },
  );

  return router;
}
