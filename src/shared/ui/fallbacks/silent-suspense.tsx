import { Suspense, type ReactNode } from 'react';

/**
 * Wraps one lazily loaded overlay or control. It shows nothing while its chunk arrives, so the screen
 * around it stays put; without a boundary of its own, the route's boundary would swap the whole screen
 * for the loading picture the first time the piece opens.
 */
export function SilentSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
