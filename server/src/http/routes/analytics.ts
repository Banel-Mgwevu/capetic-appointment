import { Router } from 'express';
import type { z } from 'zod';
import type { AnalyticsService } from '../../services/analyticsService.js';
import type { AuthService } from '../../services/authService.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate, validated } from '../middleware/validate.js';
import { analyticsQuery } from '../schemas.js';

interface Deps {
  analytics: AnalyticsService;
  auth: AuthService;
}

export function analyticsRouter({ analytics, auth }: Deps): Router {
  const router = Router();

  router.get('/analytics/summary', requireAdmin(auth), validate('query', analyticsQuery), (_req, res) => {
    const { rangeDays } = validated<z.infer<typeof analyticsQuery>>(res, 'query');
    res.json(analytics.summary(rangeDays));
  });

  return router;
}
