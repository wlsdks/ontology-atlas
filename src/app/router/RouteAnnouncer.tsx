import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/** A polite live region that reads the new screen's title out after each navigation settles. */
export function RouteAnnouncer() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState('');
  useEffect(
    () =>
      router.subscribe('onResolved', ({ pathChanged }) => {
        if (!pathChanged) return;
        // The title is written by the screen that just rendered, a frame after the router resolves.
        requestAnimationFrame(() => setAnnouncement(document.title));
      }),
    [router],
  );
  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="route-announcer" className="sr-only">
      {announcement}
    </div>
  );
}
