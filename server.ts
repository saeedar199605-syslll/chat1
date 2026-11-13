import 'dotenv/config'; // must load before ./server/* reads process.env
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import './server/db-node';
import { createApp } from './server/app';
import { initSocketServer } from './server/socket';
import { attachWebSocket } from './server/ws-node';
import { setupSwagger } from './server/swagger';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = createApp((a) => {
    a.use(compression());
    // Auto-generated Swagger API documentation at /api/docs
    if (!isProd || process.env.ENABLE_DOCS === 'true') setupSwagger(a);
  });
  const httpServer = http.createServer(app);

  // Real-time hub (rooms, typing, huddles, WebRTC signaling) on /ws
  attachWebSocket(httpServer, initSocketServer());

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
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
