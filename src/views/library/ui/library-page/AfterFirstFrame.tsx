"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";

/**
 * Mounts `children` after the frame that drew this box, holding their flex room with an empty box
 * meanwhile. A settled folder renders them as a transition, so React slices the work across frames.
 * While the folder is still being read, every arriving part would restart that transition and hold
 * the first rows back until the read ends, so the mount is a plain update one frame later instead.
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
