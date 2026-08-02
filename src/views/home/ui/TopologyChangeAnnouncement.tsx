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
       * 상단 크롬 **아래**에 선다 (2026-08-02, 소유자 지적: *"이거보면 화면
       * 작아졌을때 … 겹쳐져서 나오지?"*).
       *
       * 종전 `top-4`(16px)는 상단 크롬 띠와 **같은 자리**였다 — 실측: 크롬 필
       * (「자동 정렬」·「검색」)이 y 32–68 에 있고 둘 다 `left-1/2` 로 가운데
       * 정렬이라, 높이 36px 인 이 토스트가 y 16–52 에 떠서 세로로 20px 겹쳤다.
       * 가로는 둘 다 중앙이므로 완전히 포개진다.
       *
       * 값은 크롬 띠에서 파생한다 — 크롬 top(2rem) + 타일 높이 + 8px 여백.
       * 숫자를 새로 정하면 크롬 치수가 바뀔 때 이 겹침이 조용히 돌아온다.
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
