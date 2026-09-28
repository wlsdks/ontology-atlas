"use client";

import { useEffect, useRef, useState } from "react";
import { decideChangeAnnouncement } from "../lib/change-announcement";

/**
 * A transient chip confirming a manifest refresh landed ("N concepts updated"), once per real
 * increase (`lib/change-announcement.ts`). Unlike the persistent `TopologyReviewLink` it
 * auto-dismisses and has no click target. One opacity fade; reduced motion skips only the fade, not
 * the timer.
 */
const AUTO_DISMISS_MS = 4000;

export function TopologyChangeAnnouncement({
  touchedCount,
  message,
}: {
  touchedCount: number;
  message: (count: number) => string;
}) {
  const [delta, setDelta] = useState<number | null>(null);
  const previousCountRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const decision = decideChangeAnnouncement(previousCountRef.current, touchedCount);
    previousCountRef.current = touchedCount;
    if (!decision.show) return;
    setDelta(decision.delta);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setDelta(null), AUTO_DISMISS_MS);
  }, [touchedCount]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  if (delta === null) return null;

  return (
    <div
      // Chrome top (2rem) + tile height + 8px gap, derived so it stays below the chrome row when
      // dimensions change.
      className="pointer-events-none absolute left-1/2 top-[calc(2rem+var(--chrome-tile-size)+0.5rem)] z-20 -translate-x-1/2"
      data-testid="topology-change-announcement"
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-label tracking-label text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
      >
        {message(delta)}
      </div>
    </div>
  );
}
