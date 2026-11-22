"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";

/**
 * Mounts `children` one frame after this box is drawn, holding their flex room meanwhile. While the
 * folder is still being read every arriving part would restart a transition and hold the first rows
 * back, so the mount is a plain update instead.
 */
export function AfterFirstFrame({ children, reading }: { children: ReactNode; reading: boolean }) {
  const [ready, setReady] = useState(false);
  const [readingAtMount] = useState(reading);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (readingAtMount) setReady(true);
      else startTransition(() => setReady(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [readingAtMount]);
  return ready ? children : <div aria-hidden className="flex min-h-0 min-w-0 flex-1" />;
}
