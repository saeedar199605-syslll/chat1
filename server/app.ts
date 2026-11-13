import express from 'express';
import { readBody } from './http';
import { registerApiRoutes } from './routes';

/** The HTTP API shared by the Node server and the Cloudflare Durable Object. */
export function createApp(beforeRoutes?: (app: express.Express) => void): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

  // Hardened HTTP security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  beforeRoutes?.(app);
  app.use(readBody);
  registerApiRoutes(app);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // JSON errors (never leak stack traces)
  app.use((err: { status?: number; message?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message || 'Bad request' });
  });
  return app;
}
