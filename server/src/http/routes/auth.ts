import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AuthService } from '../../services/authService.js';
import { accessBody, adminLoginBody, referenceParams } from '../schemas.js';
import { validate, validated } from '../middleware/validate.js';

interface Deps {
  auth: AuthService;
  rateLimiting: boolean;
}

export function authRouter({ auth, rateLimiting }: Deps): Router {
  const router = Router();

  // Both endpoints are guess-a-secret targets (contact details / admin
  // password), so they get a tighter limit than ordinary booking traffic.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !rateLimiting,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
  });

  router.post(
    '/appointments/:reference/access',
    limiter,
    validate('params', referenceParams),
    validate('body', accessBody),
    (_req, res, next) => {
      try {
        const { reference } = validated<z.infer<typeof referenceParams>>(res, 'params');
        const { contact } = validated<z.infer<typeof accessBody>>(res, 'body');
        res.json(auth.accessAppointment(reference, contact));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/auth/login', limiter, validate('body', adminLoginBody), (_req, res, next) => {
    try {
      const { username, password } = validated<z.infer<typeof adminLoginBody>>(res, 'body');
      res.json(auth.adminLogin(username, password));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
