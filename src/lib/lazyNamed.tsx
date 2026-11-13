import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';

/**
 * Code-split a named export; each use gets its own Suspense so the rest of the UI never blanks.
 * `defer` holds the chunk back until after first load (3s, or the first click/key), so modals don't
 * compete with the data requests that paint the first screen.
 */
export function lazyNamed<M extends Record<string, ComponentType<any>>, K extends keyof M>(
  loader: () => Promise<M>,
  key: K,
  opts: { defer?: boolean } = {}
): M[K] {
  const Lazy = lazy(() => loader().then((m) => ({ default: m[key] })));
  const Wrapped = (props: Record<string, unknown>) => {
    const [ready, setReady] = useState(!opts.defer);
    useEffect(() => {
      if (ready) return;
      const go = () => setReady(true);
      const t = setTimeout(go, 3000);
      window.addEventListener('pointerdown', go, { once: true });
      window.addEventListener('keydown', go, { once: true });
      return () => {
        clearTimeout(t);
        window.removeEventListener('pointerdown', go);
        window.removeEventListener('keydown', go);
      };
    }, [ready]);
    return ready ? (
      <Suspense fallback={null}>
        <Lazy {...(props as any)} />
      </Suspense>
    ) : null;
  };
  return Wrapped as unknown as M[K];
}
