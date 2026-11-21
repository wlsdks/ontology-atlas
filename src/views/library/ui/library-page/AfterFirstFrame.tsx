"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";

/**
 * Mounts `children` after the frame that drew this box, holding their flex room with an empty box
 * meanwhile. The render is a transition, so React slices it across frames instead of one long one.
 */
export function AfterFirstFrame({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  return ready ? children : <div aria-hidden className="flex min-h-0 min-w-0 flex-1" />;
}
