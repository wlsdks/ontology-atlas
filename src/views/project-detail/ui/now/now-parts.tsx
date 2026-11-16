"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EXIT_TRANSITION, MOTION, STAGGER } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";

/** One heading style for every section of the page: what to check, what changed, the composition. */
export const SECTION_HEADING_CLASS =
  "text-title font-[var(--font-weight-strong)] tracking-title tabular-nums text-[color:var(--color-text-primary)]";

/** The page's one stale mark and one recent-change mark: the map's two tokens, drawn as dots. */
export const STALE_DOT_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-status-warning)]";
export const RECENT_DOT_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--map-recent-change)]";

/**
 * A short text that changes in place, such as a count or the evidence line: the old words fade
 * out while the new ones fade in, in one grid cell, so nothing beside them moves.
 */
export function CrossFadeText({
  text,
  className,
  id,
  testId,
  title,
  reducedMotion,
  as = "span",
}: {
  text: string;
  className?: string;
  id?: string;
  testId?: string;
  title?: string;
  reducedMotion: boolean;
  as?: "span" | "h2" | "p";
}) {
  const Tag = as;
  return (
    <Tag id={id} data-testid={testId} title={title} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] [grid-template-areas:'text']", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          className="min-w-0 truncate [grid-area:text]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: reducedMotion ? MOTION.fast : EXIT_TRANSITION }}
          transition={MOTION.fast}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </Tag>
  );
}

/** The heading line of a section: the heading on the left, its one door on the right. */
export function SectionHeadingLine({ heading, door }: { heading: ReactNode; door?: ReactNode }) {
  return (
    <div className="flex min-h-7 min-w-0 items-baseline justify-between gap-x-4">
      {heading}
      {door ? <div className="shrink-0">{door}</div> : null}
    </div>
  );
}

/** Rows that mount inside this window after the first rows enter with the page, in reading order. */
const ARRIVAL_WINDOW_MS = 600;

/** True until the first rows have had their entrance; rows that mount later are a data change. */
export function useArrival(hasRows: boolean): boolean {
  const [arrival, setArrival] = useState(true);
  useEffect(() => {
    if (!hasRows || !arrival) return;
    const timer = window.setTimeout(() => setArrival(false), ARRIVAL_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [hasRows, arrival]);
  return arrival;
}

/** How a row arrives: in reading order on the page's arrival, alone when the data changes. */
export function rowMotion({ index, arrival, reducedMotion }: { index: number; arrival: boolean; reducedMotion: boolean }) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: MOTION.fast },
      transition: MOTION.fast,
    } as const;
  }
  return {
    initial: { opacity: 0, y: arrival ? 6 : 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: EXIT_TRANSITION },
    transition: {
      opacity: { ...MOTION.base, delay: arrival ? index * STAGGER : 0 },
      y: { ...MOTION.base, delay: arrival ? index * STAGGER : 0 },
      layout: MOTION.settle,
    },
  } as const;
}
