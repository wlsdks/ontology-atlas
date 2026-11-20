"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { deriveSourceProgress, type LibrarySourceRow } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { WorkGlyph } from "@/shared/motion/work-glyph";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { GetAppLink } from "@/shared/ui/controls/get-app-link";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { PROGRESS_COMPLETE_INK, PROGRESS_SEGMENTS as SEGMENTS, progressInk } from "./progress-inks";
import { SourceProgressChart } from "./SourceProgressChart";
import { useBandMotion } from "./use-band-motion";

/** Folders whose band already counted up this session; a later visit draws the values at once. */
const counted = new Set<string>();
/** The longest a first open waits for hashing before it counts up anyway. */
const INTRO_WAIT_MS = 1200;
/** Folders whose bar already carried the light at 100% this session. */
const lit = new Set<string>();

function subscribeToDay(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/** Noon of the local day, so the snapshot holds still all day and moves at midnight. */
function localNoon(): number {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  return day.getTime();
}

/**
 * Text React writes once; later frames are drawn by the motion, so a re-render never puts the final
 * number over a counting one.
 */
function FirstText({ text }: { text: string }) {
  const [first] = useState(text);
  return <>{first}</>;
}

/** What the Continue press needs from the request it starts (`useCompileBatch` on the page). */
export interface ContinueBatch {
  /** Sources the next press names, in list order. */
  next: readonly LibrarySourceRow[];
  /** Paths the request in flight named; empty while none runs. */
  running: ReadonlySet<string>;
  /** Waiting sources after the next press, or after the request in flight while one runs. */
  rest: number;
  /** Sources the last finished request named that still have no wiki page. */
  returned: number;
  start: () => void;
}

/** Why Continue cannot run, and the door that fixes it when one exists. */
export interface ContinueBlocked {
  reason: string;
  door: ReactNode | null;
}

/** The state the list is narrowed to, and the presses that change it (`useSourceFilter`). */
export interface SourceStateFilter {
  state: SourceState | null;
  press: (state: SourceState) => void;
  clear: () => void;
}

type SourceState = LibrarySourceRow["state"];

/** Below this many sources the number is a fraction: "3 / 7" says more than "42%". */
const FRACTION_BELOW = 10;
/** A chart of fewer recorded days than this is a step, not a history. */
const CHART_MIN_DAYS = 3;
/** The presses in the bar's order: its segments left to right, then the empty track. */
const PRESS_ORDER: readonly SourceState[] = [
  ...SEGMENTS.flatMap((segment) => segment.states as readonly SourceState[]),
  "not-compiled",
];

/** Buckets in which at least one page records its date: the days the chart can say something about. */
function recordedDays(series: readonly { count: number }[]): number {
  let days = 0;
  let previous = 0;
  for (const point of series) {
    if (point.count > previous) days += 1;
    previous = point.count;
  }
  return days;
}

/**
 * How many sources have a wiki page, what state the rest are in, since when, and the press that
 * writes the next ones: one row above the Sources home's graph, at most 112px tall from `md` up. Four
 * cells: the number and its sentence, the bar with one press per state (which filters the list and
 * lights the picture), the chart when the pages record three days or more, and Continue with the
 * agent's work line. A narrow band stacks the bar under the number.
 *
 * On a folder's first visit in a session the number, the sentence's count, the bar and the chart
 * count up together, so no frame shows one number beside another; until the count starts they are
 * not drawn. Later changes move on from what is drawn.
 */
export function SourceProgressBand({
  sources,
  vaultScope,
  batch,
  blocked,
  inApp,
  filter,
  workLine,
  locale,
  t,
}: {
  sources: LibrarySourceRow[];
  vaultScope: string;
  batch: ContinueBatch;
  /** Null when Continue can run. */
  blocked: ContinueBlocked | null;
  inApp: boolean;
  filter: SourceStateFilter;
  /**
   * The agent's work line, in the app only. Its slot is part of the cell from the first paint, so the
   * first event moves nothing; null on the web, where no agent works.
   */
  workLine: ReactNode | null;
  locale: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const reduced = usePrefersReducedMotion();
  const noon = useSyncExternalStore(subscribeToDay, localNoon, localNoon);
  const progress = useMemo(() => deriveSourceProgress({ sources }, { now: noon }), [sources, noon]);
  const [intro] = useState(() => !counted.has(vaultScope) && !reduced);
  useEffect(() => {
    counted.add(vaultScope);
  }, [vaultScope]);
  // A first open counts up to settled numbers: it waits while cited files are still being checked,
  // for at most `INTRO_WAIT_MS`, so the count does not start on one number and swerve to another.
  const [waited, setWaited] = useState(!intro);
  useEffect(() => {
    if (waited) return;
    const id = setTimeout(() => setWaited(true), INTRO_WAIT_MS);
    return () => clearTimeout(id);
  }, [waited]);

  const { total, compiled, byState, percent, underOnePercent, today } = progress;
  const complete = total > 0 && compiled === total;
  const boundaries = SEGMENTS.reduce<number[]>((acc, segment) => {
    const share = segment.states.reduce((sum, state) => sum + byState[state], 0) / Math.max(1, total);
    acc.push((acc[acc.length - 1] ?? 0) + share);
    return acc;
  }, []);

  const percentRef = useRef<HTMLSpanElement | null>(null);
  const todayRef = useRef<HTMLSpanElement | null>(null);
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const seamRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lightOn, setLightOn] = useState(false);
  const sentenceRef = useRef<HTMLParagraphElement | null>(null);
  const drawnText = useRef({ percent: "", today: "", sentence: "" });
  const [counting, setCounting] = useState(intro);

  const fraction = total < FRACTION_BELOW;
  // The number for a drawn share of the bar's first segment: a count while the folder is small.
  const percentText = useCallback(
    (share: number) => {
      if (fraction) return t("progress.fraction", { compiled: Math.min(compiled, Math.floor(share * total + 1e-6)), total });
      if (underOnePercent) return t("progress.underOne");
      const drawn = Math.floor(share * 100 + 1e-6);
      return t("progress.percent", { percent: complete ? drawn : Math.min(drawn, 99) });
    },
    [compiled, complete, fraction, t, total, underOnePercent],
  );
  const finalNumber = fraction
    ? t("progress.fraction", { compiled, total })
    : underOnePercent
      ? t("progress.underOne")
      : t("progress.percent", { percent });

  // The sentence for a count of `shown` sources with a page; its kind follows the settled numbers.
  const sentenceFor = useCallback(
    (shown: number) =>
      compiled === 0 && byState.checking === 0
        ? t("progress.first")
        : byState.checking > 0
          ? t("stage.read.coveredChecking", { compiled: shown, total, checking: byState.checking })
          : byState.unreadable > 0
            ? t("stage.read.coveredUnreadable", { compiled: shown, total, unreadable: byState.unreadable })
            : t("stage.read.coveredLine", { compiled: shown, total }),
    [byState.checking, byState.unreadable, compiled, t, total],
  );

  const hold = !waited && byState.checking > 0;
  const [started, setStarted] = useState(!intro);
  const start = useCallback(() => setStarted(true), []);
  useBandMotion([...boundaries, today], { intro, reduced, hold, onStart: start }, (drawn, settled) => {
    let start = 0;
    SEGMENTS.forEach((_, i) => {
      const end = drawn[i] ?? 0;
      const segment = segmentRefs.current[i];
      if (segment) segment.style.transform = `translateX(${(start * 100).toFixed(3)}%) scaleX(${Math.max(0, end - start).toFixed(5)})`;
      const seam = seamRefs.current[i];
      if (seam) {
        seam.style.transform = `translateX(${(end * 100).toFixed(3)}%)`;
        seam.style.opacity = end > 0.001 && end < 0.999 ? "1" : "0";
      }
      start = end;
    });
    const nextPercent = settled ? finalNumber : percentText(drawn[0] ?? 0);
    if (percentRef.current && drawnText.current.percent !== nextPercent) {
      percentRef.current.textContent = nextPercent;
      drawnText.current.percent = nextPercent;
    }
    if (counting) {
      const nextSentence = settled ? sentenceFor(compiled) : sentenceFor(Math.min(compiled, Math.floor((drawn[0] ?? 0) * total + 1e-6)));
      if (sentenceRef.current && drawnText.current.sentence !== nextSentence) {
        sentenceRef.current.textContent = nextSentence;
        drawnText.current.sentence = nextSentence;
      }
      if (settled) setCounting(false);
    }
    const nextToday = t("progress.today", { count: Math.round(drawn[SEGMENTS.length] ?? 0) });
    if (todayRef.current && drawnText.current.today !== nextToday) {
      todayRef.current.textContent = nextToday;
      drawnText.current.today = nextToday;
    }
    if (settled && complete && !reduced && !lit.has(vaultScope)) {
      lit.add(vaultScope);
      setLightOn(true);
    }
  });

  const sentence = sentenceFor(compiled);
  const showChart = recordedDays(progress.series) >= CHART_MIN_DAYS;
  const running = batch.running.size > 0;
  const blockedId = "library-progress-blocked";
  const grouped = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const presses = PRESS_ORDER.filter((state) => byState[state] > 0);
  const compactPresses = presses.length > 2;

  return (
    <section
      aria-label={t("progress.aria")}
      data-testid="library-progress"
      data-percent={percent}
      data-complete={complete ? "" : undefined}
      className="@container flex-none border-b border-[color:var(--color-border-soft)] px-5 py-2.5 sm:px-6 md:max-h-[112px] md:px-10"
    >
      <div className="flex items-center gap-x-6 gap-y-2 max-md:flex-wrap">
        {/* Number over bar while the band is narrow; from 60rem they are two cells of one row. */}
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5 max-md:min-w-[16rem] max-md:flex-1 @min-[60rem]:flex-row @min-[60rem]:items-center @min-[60rem]:gap-6",
            // With no chart beside it the bar may take its full width.
            showChart ? "md:flex-none" : "md:flex-1",
          )}
        >
          <div
            data-testid="library-progress-number-cell"
            className="flex min-w-0 flex-col gap-0.5 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] @min-[60rem]:w-max @min-[60rem]:min-w-[10rem] @min-[60rem]:max-w-[16rem] @min-[60rem]:flex-none"
            style={started ? undefined : { opacity: 0 }}
          >
            <p className="flex min-w-0 items-baseline gap-2">
              <span
                ref={percentRef}
                aria-hidden
                data-testid="library-progress-percent"
                className="text-display leading-display-tight font-[var(--font-weight-strong)] tabular-nums whitespace-nowrap text-[color:var(--color-text-primary)]"
              >
                <FirstText text={intro ? (fraction ? percentText(0) : underOnePercent ? finalNumber : t("progress.percent", { percent: 0 })) : finalNumber} />
              </span>
              <span className="sr-only">{finalNumber}</span>
              {today > 0 ? (
                <span
                  ref={todayRef}
                  data-testid="library-progress-today"
                  className="motion-swap-in whitespace-nowrap text-label leading-body tabular-nums text-[color:var(--color-indigo-accent)]"
                >
                  <FirstText text={t("progress.today", { count: intro ? 0 : today })} />
                </span>
              ) : null}
            </p>
            {/* While counting, the sentence is drawn with the number; a new element takes over once it settles. */}
            <p
              key={counting ? "counting" : "settled"}
              ref={counting ? sentenceRef : undefined}
              aria-hidden={counting || undefined}
              title={sentence}
              data-testid="library-progress-sentence"
              className="min-w-0 truncate text-body leading-body text-[color:var(--color-text-primary)]"
            >
              {counting ? <FirstText text={sentenceFor(0)} /> : sentence}
            </p>
            {counting ? <span className="sr-only">{sentence}</span> : null}
          </div>

          <div
            data-testid="library-progress-bar-cell"
            className={
              "flex min-w-[280px] max-w-[560px] flex-col gap-1.5 " +
              (showChart ? "@min-[60rem]:w-fit @min-[60rem]:flex-none" : "@min-[60rem]:flex-1")
            }
          >
            <span
              aria-hidden
              data-testid="library-progress-bar"
              className="relative block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
            >
              {SEGMENTS.map((segment, i) => (
                <span
                  key={segment.states.join("-")}
                  ref={(node) => {
                    segmentRefs.current[i] = node;
                  }}
                  className="motion-progress-segment absolute inset-0 origin-left"
                  style={{
                    backgroundColor: i === 0 && complete ? PROGRESS_COMPLETE_INK : segment.ink,
                    transform: "scaleX(0)",
                  }}
                />
              ))}
              {SEGMENTS.map((segment, i) => (
                <span
                  key={`seam-${segment.states.join("-")}`}
                  ref={(node) => {
                    seamRefs.current[i] = node;
                  }}
                  className="absolute inset-0"
                  style={{ opacity: 0 }}
                >
                  <span className="absolute inset-y-0 left-0 w-px bg-[color:var(--color-canvas)]" />
                </span>
              ))}
              {lightOn ? (
                <span
                  data-testid="library-progress-light"
                  onAnimationEnd={() => setLightOn(false)}
                  className="motion-progress-light absolute inset-y-0 left-0 w-1/3 bg-[image:linear-gradient(90deg,transparent,var(--color-success-text-a90)_50%,transparent)]"
                />
              ) : null}
            </span>
            {/* One press per state the folder holds, in the bar's order; each narrows the list and lights its marks. */}
            <div
              role="group"
              aria-label={t("sources.statesAria")}
              data-testid="library-source-states"
              className="-ml-1.5 flex min-w-0 flex-nowrap items-center gap-x-0.5"
            >
              {presses.map((state) => {
                const label = t(`sources.state.${state}.label`);
                const pressed = filter.state === state;
                return (
                  <button
                    key={state}
                    type="button"
                    data-testid={`library-source-states-${state}`}
                    aria-pressed={pressed}
                    title={t("sources.filterShow", { label })}
                    onClick={() => filter.press(state)}
                    className={controlClass({
                      shape: "segment",
                      size: "xs",
                      tone: "muted",
                      hoverInk: "strong",
                      hoverSurface: "lift",
                      active: pressed,
                      className: "flex-none gap-1.5 whitespace-nowrap",
                    })}
                  >
                    <span
                      aria-hidden
                      data-testid={`library-source-states-swatch-${state}`}
                      className={cn(
                        "inline-block size-1.5 flex-none rounded-full",
                        state === "not-compiled" && "border border-[color:var(--color-border-strong)]",
                      )}
                      style={{ backgroundColor: progressInk(state, complete) }}
                    />
                    {/* Three or more presses in a narrow pane keep swatch and count; the word stays in `title` and for a screen reader. */}
                    <span className={cn(compactPresses && "@max-[50rem]:sr-only")}>{label}</span>
                    <span className="tabular-nums">{grouped.format(byState[state])}</span>
                  </button>
                );
              })}
              {filter.state ? (
                <button
                  type="button"
                  data-testid="library-source-states-all"
                  onClick={filter.clear}
                  className={controlClass({
                    shape: "segment",
                    size: "xs",
                    tone: "accent",
                    hoverInk: "strong",
                    hoverSurface: "lift",
                    className: "motion-swap-in flex-none whitespace-nowrap tabular-nums",
                  })}
                >
                  {t("sources.filterAll", { count: total })}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {showChart ? (
          /* The chart takes what the other cells leave, and steps aside when that is too little to read. */
          <div className="@container min-w-0 flex-1 max-md:hidden md:max-w-[26rem]">
            <div className="@max-[9rem]:hidden">
              <SourceProgressChart progress={progress} intro={intro} started={started} reduced={reduced} locale={locale} t={t} />
            </div>
          </div>
        ) : null}

        <div
          data-testid="library-progress-action"
          className={cn(
            // A bounded width, so a long work-line path truncates rather than widening the row.
            "flex min-w-0 flex-col items-start gap-1 md:w-[clamp(14rem,24cqw,16rem)] md:flex-none",
            !showChart && "md:ml-auto",
          )}
        >
          {complete ? (
            <p data-testid="library-progress-done" className="flex items-center gap-1.5 whitespace-nowrap text-body leading-body text-[color:var(--color-success-text-a94)]">
              <WorkGlyph phase="done" size={ICON_SIZE.sm} />
              {t("progress.allDone")}
            </p>
          ) : blocked && !inApp ? (
            <>
              <p data-testid="library-progress-blocked" className="text-label leading-body text-[color:var(--color-text-secondary)]">
                {t("progress.webLine")}
              </p>
              <GetAppLink data-testid="library-progress-get-app">{t("wiki.compileWebGetApp")}</GetAppLink>
            </>
          ) : batch.next.length > 0 || running ? (
            <>
              <Button
                size="sm"
                data-testid="library-progress-continue"
                onClick={batch.start}
                disabled={blocked !== null || running}
                aria-describedby={blocked ? blockedId : undefined}
                className="atlas-touch-floor max-w-full"
              >
                {running ? <WorkGlyph phase="running" inControl /> : null}
                <span className="min-w-0 truncate">{t("progress.continue", { count: batch.next.length })}</span>
              </Button>
              {blocked ? (
                <p id={blockedId} data-testid="library-progress-blocked" className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                  {blocked.reason}
                </p>
              ) : batch.returned > 0 && !running ? (
                <p data-testid="library-progress-returned" className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                  {t("progress.batchReturned", { count: batch.returned })}
                </p>
              ) : batch.rest > 0 ? (
                <p data-testid="library-progress-rest" className="text-caption leading-caption tabular-nums text-[color:var(--color-text-tertiary)]">
                  {t("progress.batchRest", { count: batch.rest })}
                </p>
              ) : null}
              {blocked?.door ?? null}
            </>
          ) : null}
          {workLine}
        </div>
      </div>
    </section>
  );
}
