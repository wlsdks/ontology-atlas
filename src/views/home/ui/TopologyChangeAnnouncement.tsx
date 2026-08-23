"use client";

import { useEffect, useRef, useState } from "react";
import { decideChangeAnnouncement } from "../lib/change-announcement";

/**
 * W6 agent visibility — a thin, self-dismissing chrome chip at the top of
 * the topology map confirming a vault manifest refresh just landed ("N
 * concepts updated — synced"). Fires once per real increase of the
 * touched-node count (`ontologyChangeset.touchedNodeIds.size` in
 * `HomePage`) — the pure delta/baseline decision lives in
 * `lib/change-announcement.ts` so it's unit-testable without a timer or DOM.
 *
 * Deliberately NOT a duplicate of `TopologyReviewLink` ("Self-Drawing Diff
 * #5"): that pill is a PERSISTENT "N unreviewed changes, come review them"
 * call-to-action that stays up until the user reviews. This chip is a
 * TRANSIENT "this just happened" acknowledgment — auto-dismissed after
 * `AUTO_DISMISS_MS`, no click target, no review affordance. Both read the
 * same underlying count; neither duplicates the other's store.
 *
 * No loop motion — a single opacity transition on mount/unmount
 * (`transition-opacity`, `motion-reduce:transition-none` — the global
 * `prefers-reduced-motion` rule in `app/globals.css` already zeroes it for
 * users who asked for less motion, so the 4s auto-dismiss timer itself is
 * unaffected — only the fade is skipped).
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
      /*
       * Sits **below** the top chrome row. Owner, 2026-08-02: *"When I look at this on a smaller screen … they overlap, right?"* (on a smaller screen these overlap).
       *
       * The former `top-4` (16px) put it in the **same place** as the chrome row.
       * Measured: the chrome pills sit at y 32–68 and both are centred with
       * `left-1/2`, so this 36px toast at y 16–52 overlapped them by 20px
       * vertically and completely horizontally.
       *
       * The value is derived from the chrome row — chrome top (2rem) + tile height
       * + 8px gap. Picking a fresh number brings the overlap back silently the
       * next time a chrome dimension changes.
       */
      className="pointer-events-none absolute left-1/2 top-[calc(2rem+var(--chrome-tile-size)+0.5rem)] z-20 -translate-x-1/2"
      data-testid="topology-change-announcement"
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto inline-flex h-[var(--chrome-tile-size)] items-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-[length:var(--topology-chrome-title-size)] text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
      >
        {message(delta)}
      </div>
    </div>
  );
}
