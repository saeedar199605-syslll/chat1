import 'dotenv/config'; // must load before ./server/* reads process.env
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import './server/db';
import { registerApiRoutes } from './server/routes';
import { initSocketServer } from './server/socket';
import { setupSwagger } from './server/swagger';

async function bootstrap() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
  const httpServer = http.createServer(app);

  // Hardened HTTP security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Auto-generated Swagger API documentation at /api/docs
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true') setupSwagger(app);

  // REST API & S3-compatible local upload/download routes
  registerApiRoutes(app);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Real-time Socket.io + WebRTC signaling gateway
  initSocketServer(httpServer);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    // Vite file names are content-hashed: cache them for a year; index.html must always revalidate.
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        setHeaders: (res, file) => {
          if (/-[A-Za-z0-9_-]{8}\.\w+$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );
    app.use(express.static(distDir, { maxAge: 0 }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // JSON errors for malformed bodies, upload limits, etc. (never leak stack traces)
  app.use((err: { status?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message || 'Bad request' });
  });

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Workstream enterprise server listening on http://localhost:${port}`);
    console.log(`Swagger API documentation available at http://localhost:${port}/api/docs`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Workstream server:', err);
  process.exit(1);
});
