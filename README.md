# Workstream (Esfahan Chalak)

Team chat, tasks, wiki, huddles (WebRTC), approvals and audit log. Node + Express + Socket.IO + SQLite (`node:sqlite`), React/Vite frontend.

## Development

```
npm install
npm run dev        # http://localhost:3000, seeds demo users (password Workstream!2026)
npm run lint       # type-check
```

The passwordless persona switcher is off by default; set `ENABLE_DEMO_SWITCH=true` in `.env` to use it in development.

## Production

1. Copy `.env.example` to `.env` and set `NODE_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (first run only), and `APP_URL`.
2. `npm ci && npm run build && npm start`
3. Put it behind HTTPS (nginx/Caddy) and set `TRUST_PROXY=true`. WebRTC huddles need HTTPS and, across NATs, a TURN server.
4. Back up `DATA_DIR` (default `./data`: `workstream.db` + `uploads/`).

Production starts empty (no demo data), refuses to start without strong secrets, disables self-registration, the demo switcher and `/api/docs` unless enabled.

Known limits: file download URLs (`/api/files/download/<random key>`) are unguessable links, not login-gated; single-process only (in-memory rate limits, huddle state); `docker-compose.yml` and `prisma/` are unused scaffolding (the app uses SQLite).
