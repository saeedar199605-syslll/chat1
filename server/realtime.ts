/**
 * Minimal Socket.IO-style realtime hub (rooms, events, auth middleware) that runs on any transport:
 * `ws` on Node, WebSocketPair inside a Cloudflare Durable Object. Wire format: JSON `{ e: event, d: data }`.
 * The first client message must be `{ e: '__auth', d: { token } }`.
 */
export interface Transport {
  send(data: string): void;
  close(): void;
}

type Handler = (...args: any[]) => void;
type Middleware = (socket: Conn, next: (err?: Error) => void) => void;

const MAX_MESSAGE = 1_000_000;

export class Conn {
  readonly id = crypto.randomUUID();
  data: Record<string, any> = {};
  handshake: { auth: Record<string, unknown> } = { auth: {} };
  rooms = new Set<string>();
  authed = false;
  closed = false;
  private handlers = new Map<string, Handler[]>();

  constructor(
    private hub: Hub,
    private transport: Transport
  ) {}

  on(event: string, fn: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, data?: unknown): void {
    try {
      this.transport.send(JSON.stringify({ e: event, d: data }));
    } catch {
      /* socket already closed */
    }
  }

  join(room: string): void {
    this.rooms.add(room);
    this.hub._index(room, this, true);
  }

  leave(room: string): void {
    this.rooms.delete(room);
    this.hub._index(room, this, false);
  }

  /** Everyone in `room` except this connection. */
  to(room: string) {
    return { emit: (event: string, data?: unknown) => this.hub._emitRoom(room, event, data, this) };
  }

  disconnect(): void {
    try {
      this.transport.close();
    } catch {
      /* already closed */
    }
    this.hub._closed(this);
  }

  _dispatch(event: string, data: unknown): void {
    for (const fn of this.handlers.get(event) ?? []) {
      try {
        fn(data);
      } catch (err) {
        console.error(`realtime handler "${event}" failed:`, err);
      }
    }
  }
}

export class Hub {
  readonly sockets = { sockets: new Map<string, Conn>() };
  private rooms = new Map<string, Set<Conn>>();
  private middlewares: Middleware[] = [];
  private onConnection: Array<(c: Conn) => void> = [];

  use(fn: Middleware): void {
    this.middlewares.push(fn);
  }

  on(event: 'connection', fn: (c: Conn) => void): void {
    if (event === 'connection') this.onConnection.push(fn);
  }

  to(room: string) {
    return { emit: (event: string, data?: unknown) => this._emitRoom(room, event, data) };
  }
  in = this.to;

  emit(event: string, data?: unknown): void {
    for (const c of this.sockets.sockets.values()) if (c.authed) c.emit(event, data);
  }

  /** Register a new transport; feed its incoming text frames to receive() and call closed() on close. */
  accept(transport: Transport): Conn {
    return new Conn(this, transport);
  }

  receive(conn: Conn, raw: string): void {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return;
    let msg: { e?: unknown; d?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.e !== 'string') return;
    if (!conn.authed) {
      if (msg.e === '__auth') this.authenticate(conn, (msg.d ?? {}) as Record<string, unknown>);
      else conn.disconnect();
      return;
    }
    if (msg.e.startsWith('__')) return; // reserved (e.g. keep-alive pings)
    conn._dispatch(msg.e, msg.d);
  }

  closed(conn: Conn): void {
    this._closed(conn);
  }

  private authenticate(conn: Conn, auth: Record<string, unknown>): void {
    conn.handshake = { auth };
    let i = 0;
    const next = (err?: Error): void => {
      if (err) {
        conn.emit('__error', { message: err.message });
        conn.disconnect();
        return;
      }
      const mw = this.middlewares[i++];
      if (mw) {
        try {
          mw(conn, next);
        } catch (e) {
          next(e as Error);
        }
        return;
      }
      conn.authed = true;
      this.sockets.sockets.set(conn.id, conn);
      conn.emit('__connected', { id: conn.id });
      for (const fn of this.onConnection) fn(conn);
    };
    next();
  }

  _index(room: string, conn: Conn, add: boolean): void {
    let set = this.rooms.get(room);
    if (add) {
      if (!set) this.rooms.set(room, (set = new Set()));
      set.add(conn);
    } else if (set) {
      set.delete(conn);
      if (set.size === 0) this.rooms.delete(room);
    }
  }

  _emitRoom(room: string, event: string, data: unknown, except?: Conn): void {
    for (const c of this.rooms.get(room) ?? []) if (c !== except) c.emit(event, data);
  }

  _closed(conn: Conn): void {
    if (conn.closed) return;
    conn.closed = true;
    this.sockets.sockets.delete(conn.id);
    if (!conn.authed) return;
    for (const room of conn.rooms) this._index(room, conn, false);
    conn.rooms.clear();
    conn._dispatch('disconnect', undefined);
  }
}
