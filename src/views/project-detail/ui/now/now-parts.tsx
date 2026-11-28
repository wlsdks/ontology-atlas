import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EXIT_TRANSITION, MOTION, STAGGER } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";

export const SECTION_HEADING_CLASS =
  "text-title font-[var(--font-weight-strong)] tracking-title tabular-nums text-[color:var(--color-text-primary)]";

export const STALE_DOT_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-status-warning)]";
export const RECENT_DOT_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--map-recent-change)]";

export function CrossFadeText({
  text,
  className,
  id,
  testId,
  wrapWithin,
  reducedMotion,
  as = "span",
}: {
  text: string;
  className?: string;
  id?: string;
  testId?: string;
  /**
   * Wraps instead of truncating, and holds the height of the tallest of these texts, so a swap
   * among them moves nothing below. Drawn as invisible pseudo-content, out of the text and the tree.
   */
  wrapWithin?: readonly string[];
  reducedMotion: boolean;
  as?: "span" | "h2" | "p";
}) {
  const Tag = as;
  return (
    <Tag id={id} data-testid={testId} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] [grid-template-areas:'text']", className)}>
      {wrapWithin?.map((sizer) => (
        <span key={sizer} aria-hidden data-sizer={sizer} className="invisible min-w-0 text-pretty [grid-area:text] before:content-[attr(data-sizer)]" />
      ))}
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          className={cn("min-w-0 [grid-area:text]", wrapWithin ? "text-pretty" : "truncate")}
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
