"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { useTranslations } from "next-intl";

import type { SourceProgress, SourceProgressPoint } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";

import { useBandMotion } from "./use-band-motion";

const CHART_HEIGHT = 72;
/** Room above the ceiling and right of today's dot, so neither is cut by the box. */
const INSET_TOP = 4;
const INSET_RIGHT = 5;
const INSET_BOTTOM = 1;

/** Each point's day range in the reader's words: one day, a week's two ends, or a month. */
function pointDate(point: SourceProgressPoint, unit: SourceProgress["unit"], locale: string): string {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  if (unit === "day") return at(point.end).toLocaleDateString(locale, { month: "short", day: "numeric" });
  if (unit === "month" && point.start.slice(0, 7) === point.end.slice(0, 7)) {
    return at(point.start).toLocaleDateString(locale, { month: "short", year: "numeric" });
  }
  const format = new Intl.DateTimeFormat(locale, unit === "week" ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" });
  return format.formatRange(at(point.start), at(point.end));
}

/** The cumulative step line and its fill, in pixels, for shares of today's total. */
function stepPaths(shares: readonly number[], width: number): { line: string; fill: string; lastY: number } {
  const plotWidth = Math.max(1, width - INSET_RIGHT);
  const y = (share: number) => INSET_TOP + (1 - Math.min(1, Math.max(0, share))) * (CHART_HEIGHT - INSET_TOP - INSET_BOTTOM);
  const step = plotWidth / shares.length;
  let line = "";
  shares.forEach((share, i) => {
    const top = y(share).toFixed(2);
    line += i === 0 ? `M0 ${top}` : `V${top}`;
    line += `H${((i + 1) * step).toFixed(2)}`;
  });
  const bottom = CHART_HEIGHT - INSET_BOTTOM;
  return { line, fill: `${line}V${bottom}H0Z`, lastY: y(shares[shares.length - 1] ?? 0) };
}

/**
 * Sources with a wiki page over time, as a share of today's total: a step line over a soft fill,
 * under a dashed ceiling at today's total. One focusable element; Left and Right walk the points.
 */
export function SourceProgressChart({
  progress,
  intro,
  reduced,
  locale,
  t,
}: {
  progress: SourceProgress;
  intro: boolean;
  reduced: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);
  const fillRef = useRef<SVGPathElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [ripples, setRipples] = useState<number[]>([]);
  const gradientId = useId();
  const pointId = useId();

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const { series, total, today } = progress;
  const shares = useMemo(() => series.map((point) => (total === 0 ? 0 : point.count / total)), [series, total]);
  // The chart reveals on a first open, and again when it had nothing to draw and now has.
  const [revealed] = useState(() => intro && !reduced && series.length > 0);
  const [wasEmpty, setWasEmpty] = useState(series.length === 0);
  if (series.length === 0 && !wasEmpty) setWasEmpty(true);
  const reveal = revealed || (wasEmpty && series.length > 0 && !reduced);

  // One ring leaves today's dot for each change that adds to today while the band is open.
  const [seenToday, setSeenToday] = useState(today);
  if (today !== seenToday) {
    setSeenToday(today);
    if (today > seenToday && !reduced) setRipples((current) => [...current.slice(-2), today]);
  }

  const drawnRef = useRef<readonly number[]>([]);
  const draw = useCallback((drawn: readonly number[], boxWidth: number) => {
    drawnRef.current = drawn;
    if (drawn.length === 0 || boxWidth <= 0) return;
    const { line, fill, lastY } = stepPaths(drawn, boxWidth);
    lineRef.current?.setAttribute("d", line);
    fillRef.current?.setAttribute("d", fill);
    if (dotRef.current) dotRef.current.style.transform = `translate(${boxWidth - INSET_RIGHT}px, ${lastY}px)`;
  }, []);
  useBandMotion(shares, { intro: false, reduced }, (drawn) => draw(drawn, width));
  // A resize redraws what is on screen; it does not move a value.
  useLayoutEffect(() => draw(drawnRef.current, width), [draw, width]);

  const focusPoint = cursor === null ? null : series[cursor] ?? null;
  const pointText = focusPoint
    ? t("progress.point", {
        date: pointDate(focusPoint, progress.unit, locale),
        count: focusPoint.count,
        total,
        percent: total === 0 ? 0 : Math.floor((focusPoint.count * 100) / total),
      })
    : null;
  const plotWidth = Math.max(1, width - INSET_RIGHT);
  const cursorX = cursor === null ? null : ((cursor + 0.5) * plotWidth) / Math.max(1, series.length);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (series.length === 0) return;
    const last = series.length - 1;
    const next =
      event.key === "ArrowLeft" ? Math.max(0, (cursor ?? last + 1) - 1)
      : event.key === "ArrowRight" ? Math.min(last, (cursor ?? -1) + 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setCursor(next);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (series.length === 0 || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width - INSET_RIGHT)) * series.length);
    setCursor(Math.min(series.length - 1, Math.max(0, index)));
  };

  const caption = [
    pointText ?? t("progress.dateBasis"),
    !pointText && progress.undated > 0 ? t("progress.undated", { count: progress.undated }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        ref={boxRef}
        tabIndex={series.length > 0 ? 0 : -1}
        role="group"
        aria-label={t("progress.chartAria")}
        aria-describedby={pointId}
        data-testid="library-progress-chart"
        data-points={series.length}
        data-unit={progress.unit}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
        className={cn(
          "relative h-[72px] w-full rounded-micro focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]",
          reveal && "motion-progress-reveal",
        )}
      >
        <svg width={width} height={CHART_HEIGHT} aria-hidden className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-indigo-accent-a50)" />
              <stop offset="1" stopColor="var(--color-indigo-accent-a12)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <line x1={0} x2={plotWidth} y1={INSET_TOP} y2={INSET_TOP} stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="3 4" />
          <line x1={0} x2={plotWidth} y1={CHART_HEIGHT - 0.5} y2={CHART_HEIGHT - 0.5} stroke="var(--color-divider)" strokeWidth={1} />
          {series.length > 0 ? (
            <>
              <path ref={fillRef} fill={`url(#${gradientId})`} />
              <path ref={lineRef} fill="none" stroke="var(--color-indigo-accent)" strokeWidth={1.5} strokeLinejoin="round" />
            </>
          ) : null}
          {cursorX !== null ? (
            <line x1={cursorX} x2={cursorX} y1={INSET_TOP} y2={CHART_HEIGHT} stroke="var(--color-indigo-accent-a50)" strokeWidth={1} />
          ) : null}
        </svg>
        {series.length > 0 && today > 0 ? (
          <span ref={dotRef} aria-hidden data-testid="library-progress-today-dot" className="absolute left-0 top-0 h-0 w-0">
            {ripples.map((id) => (
              <span
                key={id}
                onAnimationEnd={() => setRipples((current) => current.filter((ripple) => ripple !== id))}
                className="motion-progress-ripple absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rounded-full border border-[color:var(--color-indigo-accent)]"
              />
            ))}
            <svg width={11} height={11} viewBox="0 0 11 11" className="absolute -left-[5.5px] -top-[5.5px]">
              <circle cx={5.5} cy={5.5} r={3.5} fill="var(--color-indigo-accent)" stroke="var(--color-canvas)" strokeWidth={2} />
            </svg>
          </span>
        ) : null}
      </div>
      <p
        id={pointId}
        aria-live="polite"
        data-testid="library-progress-caption"
        className="min-w-0 truncate text-caption leading-caption tabular-nums text-[color:var(--color-text-quaternary)]"
      >
        {caption}
      </p>
    </div>
  );
}
