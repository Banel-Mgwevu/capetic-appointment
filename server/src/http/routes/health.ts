import { Router } from 'express';
import type { Db } from '../../db/connection.js';

export function healthRouter(db: Db): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', reason: 'database unavailable' });
    }
  });
  return router;
}
