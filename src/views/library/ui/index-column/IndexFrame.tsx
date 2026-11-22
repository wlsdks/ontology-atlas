"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

import type { WikiIndexGroupKey, WikiIndexItem } from "../../lib/wiki/wiki-index";
import { fadeView, glideFrom } from "./index-motion";
import { WindowedItems, type StopProps } from "./WindowedItems";

export const INDEX_VIEW = "index";
export const MATCHES_VIEW = "matches";

/** The whole index, one group shown alone, or the filter's matches. */
export type ViewKey = WikiIndexGroupKey | typeof INDEX_VIEW | typeof MATCHES_VIEW;

export function frameSelector(view: ViewKey): string {
  return `[data-index-frame="${CSS.escape(view)}"]`;
}

/**
 * One view of the column: the whole index, or a group alone under its chip. Two exist at once only
 * while one replaces the other; the leaving one is inert and fades out from where it was drawn.
 */
export function IndexFrame({
  view,
  current,
  fadeIn,
  quick,
  chipFromTop,
  chip,
  items,
  label,
  renderItem,
  footer,
}: {
  view: ViewKey;
  current: boolean;
  /** Mounted as a swap's incoming view, so it fades in rather than being there at once. */
  fadeIn: boolean;
  /** The filter's swap, which follows typing and so takes the short fade. */
  quick: boolean;
  chipFromTop: number | null;
  chip: ReactNode;
  items: readonly WikiIndexItem[];
  label: string | undefined;
  renderItem: (item: WikiIndexItem, stop: StopProps | null, current: boolean) => ReactNode;
  footer: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const firstDraw = !mountedRef.current;
    mountedRef.current = true;
    if (firstDraw && !fadeIn) return;
    if (firstDraw) frame.style.opacity = "0";
    fadeView(frame, current, quick);
    frame.style.opacity = "";
    const chipEl = frame.querySelector("[data-index-chip]");
    if (firstDraw && chipEl && chipFromTop !== null) glideFrom(chipEl, chipFromTop - chipEl.getBoundingClientRect().top);
    // `fadeIn` and `chipFromTop` matter only at mount; `current` drives every later fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <div
      ref={frameRef}
      data-index-frame={view}
      data-current={current ? "" : undefined}
      inert={!current || undefined}
      aria-hidden={!current || undefined}
      className={cn("col-start-1 row-start-1 flex min-h-0 flex-col", current ? "z-[1]" : "pointer-events-none")}
    >
      {chip}
      <div ref={scrollerRef} data-index-scroller="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [overflow-anchor:none]">
        <WindowedItems items={items} scrollerRef={scrollerRef} label={label} renderItem={(item, stop) => renderItem(item, stop, current)} />
        {footer}
      </div>
    </div>
  );
}
