/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';

interface Env {
  APP: DurableObjectNamespace;
  ASSETS: Fetcher;
  [key: string]: unknown;
}

type Hub = import('../server/realtime').Hub;

// The emulated Node http server stays bound to its port for the life of the isolate, even if the
// Durable Object is recreated (e.g. after a deploy). Reuse it: routes read the db/hub through live bindings.
let listening: { fetch(req: Request): Promise<Response> } | null = null;

/**
 * The whole app lives in one SQLite-backed Durable Object: Express (via the Node http compat layer),
 * the realtime hub (WebSockets) and the database (synchronous DO SQLite). One object = one consistent
 * state, which is what a single-organisation chat needs.
 */
export class AppDO extends DurableObject<Env> {
  private handler!: { fetch(req: Request): Promise<Response> };
  private hub!: Hub;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      // The server modules read process.env when first imported, so copy vars/secrets first, then import.
      for (const [k, v] of Object.entries(env)) if (typeof v === 'string') process.env[k] = v;
      process.env.TRUST_CF_IP = 'true';

      const { setDb, initDatabase } = await import('../server/db');
      const sql = ctx.storage.sql;
      const params = (p: unknown[]) => p.map((v) => (v instanceof Uint8Array ? Uint8Array.prototype.slice.call(v).buffer : v)) as SqlStorageValue[];
      setDb({
        prepare: (text) => ({
          get: (...p) => sql.exec(text, ...params(p)).toArray()[0],
          all: (...p) => sql.exec(text, ...params(p)).toArray(),
          run: (...p) => {
            sql.exec(text, ...params(p)).toArray();
            return {};
          },
        }),
        exec: (text) => {
          // Pragmas are not available (or needed) in Durable Object SQLite.
          if (/^\s*PRAGMA\s+(foreign_keys|journal_mode|synchronous|busy_timeout)/i.test(text)) return;
          sql.exec(text).toArray();
        },
        transaction: (fn) => ctx.storage.transactionSync(fn),
      });
      initDatabase();

      const { createApp } = await import('../server/app');
      const { initSocketServer } = await import('../server/socket');
      this.hub = initSocketServer();
      if (!listening) {
        createApp().listen(8080);
        listening = httpServerHandler({ port: 8080 });
      }
      this.handler = listening;
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      const hub = this.hub;
      const conn = hub.accept({ send: (d) => server.send(d), close: () => server.close() });
      server.addEventListener('message', (e) => hub.receive(conn, typeof e.data === 'string' ? e.data : ''));
      server.addEventListener('close', () => hub.closed(conn));
      server.addEventListener('error', () => hub.closed(conn));
      return new Response(null, { status: 101, webSocket: client });
    }
    return this.handler.fetch(req);
  }
}

export default {
  // Static files are served by the assets binding; only /api/* and /ws reach this Worker (run_worker_first).
  fetch(req: Request, env: Env): Promise<Response> {
    return env.APP.get(env.APP.idFromName('main')).fetch(req);
  },
};
