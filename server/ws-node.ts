import type { Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Hub } from './realtime';

/** Serves the realtime hub on `/ws` of the Node HTTP server. */
export function attachWebSocket(httpServer: HttpServer, hub: Hub): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url || '/', 'http://localhost').pathname !== '/ws') return; // leave other upgrades (Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = hub.accept({ send: (d) => ws.send(d), close: () => ws.close() });
      ws.on('message', (m) => hub.receive(conn, m.toString()));
      ws.on('close', () => hub.closed(conn));
      ws.on('error', () => hub.closed(conn));
    });
  });
}
