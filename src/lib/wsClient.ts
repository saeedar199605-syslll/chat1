/**
 * Small Socket.IO-compatible client over a plain WebSocket (`/ws`). Wire format: JSON `{ e, d }`;
 * the first frame is `{ e: '__auth', d: { token } }`. Reconnects with backoff.
 */
type Handler = (...args: any[]) => void;

export interface SocketOptions {
  url?: string;
  auth?: Record<string, unknown>;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
}

export class Socket {
  connected = false;
  id: string | undefined;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  private fatal = false;

  constructor(private opts: SocketOptions) {
    this.open();
  }

  on(event: string, fn: Handler): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }

  off(event: string, fn?: Handler): this {
    if (fn) this.handlers.get(event)?.delete(fn);
    else this.handlers.delete(event);
    return this;
  }

  emit(event: string, data?: unknown): this {
    if (this.ws?.readyState === WebSocket.OPEN && this.connected) {
      this.ws.send(JSON.stringify({ e: event, d: data }));
    }
    return this;
  }

  disconnect(): this {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.cleanup();
    this.ws?.close();
    this.ws = null;
    return this;
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`socket handler "${event}" failed`, err);
      }
    }
  }

  private cleanup(): void {
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
  }

  private open(): void {
    const base = this.opts.url ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const ws = new WebSocket(`${base.replace(/\/$/, '')}/ws`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ e: '__auth', d: this.opts.auth ?? {} }));
    ws.onmessage = (ev) => {
      let msg: { e: string; d: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.e === '__connected') {
        this.connected = true;
        this.attempts = 0;
        this.id = (msg.d as { id?: string })?.id;
        this.pinger = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"e":"__ping"}'), 45_000); // Cloudflare drops sockets idle for 100s
        this.fire('connect');
      } else if (msg.e === '__error') {
        this.fatal = true; // bad/expired token: retrying with the same credentials is pointless
        this.fire('connect_error', new Error((msg.d as { message?: string })?.message || 'Unauthorized'));
      } else {
        this.fire(msg.e, msg.d);
      }
    };
    ws.onclose = () => {
      this.cleanup();
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.fire('disconnect');
      if (this.closedByUser || this.fatal || this.opts.reconnection === false) return;
      const min = this.opts.reconnectionDelay ?? 400;
      const max = this.opts.reconnectionDelayMax ?? 4000;
      const delay = Math.min(max, min * 2 ** this.attempts++) * (0.75 + Math.random() * 0.5);
      this.timer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }
}

export function io(opts: SocketOptions = {}): Socket {
  return new Socket(opts);
}
