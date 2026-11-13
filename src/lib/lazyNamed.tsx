import { Suspense, lazy, type ComponentType } from 'react';

/** Code-split a named export; each use gets its own Suspense so the rest of the UI never blanks. */
export function lazyNamed<M extends Record<string, ComponentType<any>>, K extends keyof M>(
  loader: () => Promise<M>,
  key: K
): M[K] {
  const Lazy = lazy(() => loader().then((m) => ({ default: m[key] })));
  const Wrapped = (props: Record<string, unknown>) => (
    <Suspense fallback={null}>
      <Lazy {...(props as any)} />
    </Suspense>
  );
  return Wrapped as unknown as M[K];
}
