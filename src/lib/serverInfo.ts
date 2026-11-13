import { useEffect, useState } from 'react';

export interface ServerInfo {
  demo: boolean;
  registration: boolean;
}

let cached: Promise<ServerInfo> | null = null;

/** Feature flags the server exposes on /api/health (demo persona switcher, self-registration). */
export function loadServerInfo(): Promise<ServerInfo> {
  cached ??= fetch('/api/health')
    .then((r) => r.json())
    .then((j) => ({ demo: Boolean(j.demo), registration: Boolean(j.registration) }))
    .catch(() => ({ demo: false, registration: false }));
  return cached;
}

export function useServerInfo(): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    loadServerInfo().then(setInfo);
  }, []);
  return info;
}
