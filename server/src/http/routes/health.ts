import { Router } from 'express';
import type { Db } from '../../db/connection.js';

// The commit this process was built from, so a deploy pipeline can confirm the
// new release is the one actually serving traffic. GIT_COMMIT is baked into the
// Docker image by CI; RENDER_GIT_COMMIT is injected by Render for repo-built services.
const commit = process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || 'unknown';

export function healthRouter(db: Db): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', commit, uptimeSeconds: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', reason: 'database unavailable' });
    }
  });
  return router;
}
