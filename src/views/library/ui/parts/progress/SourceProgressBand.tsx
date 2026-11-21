"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { deriveSourceProgress, type LibrarySourceRow } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { X } from "lucide-react";
import { WorkGlyph } from "@/shared/motion/status-glyphs/WorkGlyph";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { GetAppLink } from "@/shared/ui/controls/get-app-link";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import {
  drawnSourceShare,
  formatSourceShare,
  segmentClip,
  SOURCE_STATE_ORDER,
  sourceShare,
  sourceStateFill,
} from "@/widgets/library-sources-overview";

import { SourceProgressChart } from "./SourceProgressChart";
import { useBandMotion } from "./use-band-motion";

/**
 * Whether one line of text is cut by its box. The sentence carries a `title` only then: a whole
 * sentence's title repeats it, and WebKit can raise a native title away from the element it names.
 */
function useTextCut(element: HTMLElement | null, text: string): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setCut(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, text]);
  return cut;
}

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

/** A chart of fewer recorded days than this is a step, not a history. */
const CHART_MIN_DAYS = 3;

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
 * How far the folder's sources are into wiki pages, and the press that writes the next ones: one row
 * above the Sources home, of one height from `md` whatever has arrived (124px beside the panel,
 * 136px when the pane stacks), so the pane under it never moves. The statement (number, sentence, the bar with one press per state, which filters the list)
 * heads the overview's table; the chart beside it shows only the change over time, once the pages
 * record three days or more; Continue, who writes and the work line head the Next to write panel.
 * Aiming at Continue lights, on the bar, the share its sources would add.
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
  agentName,
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
  /** The connected agent's name, said beside the write button; null names no agent in particular. */
  agentName: string | null;
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

  const { total, compiled, byState, percent, today } = progress;
  const complete = total > 0 && compiled === total;
  const settledShare = sourceShare(compiled, total);
  const boundaries = SOURCE_STATE_ORDER.reduce<number[]>((acc, state) => {
    acc.push(Math.min(1, (acc[acc.length - 1] ?? 0) + byState[state] / Math.max(1, total)));
    return acc;
  }, []);

  const percentRef = useRef<HTMLSpanElement | null>(null);
  const todayRef = useRef<HTMLSpanElement | null>(null);
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lightOn, setLightOn] = useState(false);
  const sentenceRef = useRef<HTMLParagraphElement | null>(null);
  const drawnText = useRef({ percent: "", today: "", sentence: "" });
  const [counting, setCounting] = useState(intro);

  // The number for a drawn share of the bar's first segment, on the one share rule every Sources bar uses.
  const percentText = useCallback(
    (share: number) => formatSourceShare(drawnSourceShare(share, settledShare), t),
    [settledShare, t],
  );
  const finalNumber = formatSourceShare(settledShare, t);

  // The sentence for a count of `shown` sources with a page. Every other state is a press under the bar.
  const sentenceFor = useCallback(
    (shown: number) =>
      compiled === 0 && byState.checking === 0 ? t("progress.first") : t("stage.read.coveredLine", { compiled: shown, total }),
    [byState.checking, compiled, t, total],
  );

  const hold = !waited && byState.checking > 0;
  const [started, setStarted] = useState(!intro);
  const start = useCallback(() => setStarted(true), []);
  useBandMotion([...boundaries, today], { intro, reduced, hold, onStart: start }, (drawn, settled) => {
    // Each segment is a full-width layer clipped to its share, so read in part keeps its hatching.
    let start = 0;
    SOURCE_STATE_ORDER.forEach((_, i) => {
      const end = drawn[i] ?? 0;
      const segment = segmentRefs.current[i];
      if (segment) segment.style.clipPath = segmentClip(start, end);
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
    const nextToday = t("progress.today", { count: Math.round(drawn[SOURCE_STATE_ORDER.length] ?? 0) });
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
  const [settledSentence, settledSentenceRef] = useState<HTMLParagraphElement | null>(null);
  const sentenceCut = useTextCut(settledSentence, sentence);
  const showChart = recordedDays(progress.series) >= CHART_MIN_DAYS;
  const running = batch.running.size > 0;
  // Pointing at Continue, or focusing it, shows on the bar how far its sources would take the first segment.
  const [aimed, setAimed] = useState(false);
  const nextShown = aimed && blocked === null && !running && batch.next.length > 0;
  const pageEnd = boundaries[0] ?? 0;
  const nextEnd = Math.min(1, pageEnd + batch.next.length / Math.max(1, total));
  const blockedId = "library-progress-blocked";
  const grouped = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const presses = SOURCE_STATE_ORDER.filter((state) => byState[state] > 0);
  const compactPresses = presses.length > 2;
  /* With one state the number, the sentence and the bar already say it, so no legend is drawn. */
  const legendShown = presses.length > 1;
  const { state: filterState, clear: clearFilter } = filter;
  useEffect(() => {
    if (!legendShown && filterState !== null) clearFilter();
  }, [clearFilter, filterState, legendShown]);

  return (
    <section
      aria-label={t("progress.aria")}
      data-testid="library-progress"
      data-percent={percent}
      data-complete={complete ? "" : undefined}
      className="@container flex-none"
    >
      {/*
       * The overview's own inset, gap and panel width, so each cell heads the column under it. From
       * 60rem the cells share two rows: the number, the chart and the press on the first, the
       * legend, the chart's line and the work line on the second.
       */}
      <div className="flex items-start gap-x-7 gap-y-3 border-b border-[color:var(--color-border-soft)] px-10 py-5 max-md:flex-wrap @max-[40rem]:px-5 @max-[60rem]:md:h-[136px] @min-[60rem]:py-5.5 @min-[60rem]:md:h-[124px]">
        <div className="flex min-w-0 flex-1 items-start gap-x-8 max-md:min-w-[16rem]">
          <div
            data-testid="library-progress-statement"
            className={cn(
              "flex min-w-0 max-w-[35rem] flex-1 flex-col",
              showChart && "@min-[60rem]:w-[26rem] @min-[60rem]:flex-none",
            )}
          >
            {/* One line from 60rem: the number, what it counts, then today's change. Narrower, the sentence takes its own line. */}
            <div
              data-testid="library-progress-number-cell"
              className="flex min-w-0 items-center transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] @min-[60rem]:min-h-10"
              style={started ? undefined : { opacity: 0 }}
            >
            <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-0.5 @min-[60rem]:flex @min-[60rem]:gap-x-3">
              <span
                ref={percentRef}
                aria-hidden
                data-testid="library-progress-percent"
                className="text-display leading-display-tight font-[var(--font-weight-strong)] tabular-nums whitespace-nowrap text-[color:var(--color-text-primary)]"
              >
                <FirstText text={intro ? percentText(0) : finalNumber} />
              </span>
              <span className="sr-only">{finalNumber}</span>
              {today > 0 ? (
                <span
                  ref={todayRef}
                  data-testid="library-progress-today"
                  className="motion-swap-in whitespace-nowrap text-label leading-body tabular-nums text-[color:var(--color-indigo-accent)] @min-[60rem]:order-last @min-[60rem]:flex-none"
                >
                  <FirstText text={t("progress.today", { count: intro ? 0 : today })} />
                </span>
              ) : null}
              {/* While counting, the sentence is drawn with the number; a new element takes over once it settles. */}
              <p
                key={counting ? "counting" : "settled"}
                ref={counting ? sentenceRef : settledSentenceRef}
                aria-hidden={counting || undefined}
                title={!counting && sentenceCut ? sentence : undefined}
                data-testid="library-progress-sentence"
                className="col-span-2 min-w-0 truncate text-body-lg leading-body-lg text-[color:var(--color-text-primary)]"
              >
                {counting ? <FirstText text={sentenceFor(0)} /> : sentence}
              </p>
              {counting ? <span className="sr-only">{sentence}</span> : null}
            </div>
            </div>

            <div data-testid="library-progress-bar-cell" className="mt-2.5 flex min-w-0 flex-col gap-1 @min-[60rem]:mt-1.5">
              <span
                aria-hidden
                data-testid="library-progress-bar"
                className="relative block h-1.5 w-full overflow-hidden rounded-full"
              >
                {SOURCE_STATE_ORDER.map((state, i) => (
                  <span
                    key={state}
                    ref={(node) => {
                      segmentRefs.current[i] = node;
                    }}
                    data-state={state}
                    className="motion-progress-segment absolute inset-0"
                    style={{ background: sourceStateFill(state, complete), clipPath: segmentClip(0, 0) }}
                  />
                ))}
                <span
                  data-testid="library-progress-next"
                  data-shown={nextShown ? "" : undefined}
                  className={cn(
                    "absolute inset-0 bg-[color:var(--color-source-page)] transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                    nextShown ? "opacity-50" : "opacity-0",
                  )}
                  style={{ clipPath: segmentClip(pageEnd, nextEnd) }}
                />
                {lightOn ? (
                  <span
                    data-testid="library-progress-light"
                    onAnimationEnd={() => setLightOn(false)}
                    className="motion-progress-light absolute inset-y-0 left-0 w-1/3 bg-[image:linear-gradient(90deg,transparent,var(--color-success-text-a90)_50%,transparent)]"
                  />
                ) : null}
              </span>
              {/* One press per state the folder holds, in the bar's order; each narrows the list and lights its marks. */}
              {legendShown ? (
                <div
                  role="group"
                  aria-label={t("sources.statesAria")}
                  data-testid="library-source-states"
                  className="-ml-1.5 flex min-h-6 min-w-0 flex-wrap items-center gap-x-0.5"
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
                          className="inline-block size-2 flex-none rounded-full"
                          style={{ background: sourceStateFill(state, complete) }}
                        />
                        {/* Three or more presses in a narrow pane keep swatch and count; the word stays in `title` and for a screen reader. */}
                        <span className={cn(compactPresses && "@max-[60rem]:sr-only")}>{label}</span>
                        <span className="tabular-nums">{grouped.format(byState[state])}</span>
                      </button>
                    );
                  })}
                  {/*
                   * The clear press holds its slot from the first paint, so pressing a state resizes nothing;
                   * at rest it is invisible, inert and out of the tab order, and it fades in with a filter.
                   */}
                  <button
                    type="button"
                    data-testid="library-source-states-all"
                    aria-label={t("sources.filterAll", { count: total })}
                    title={t("sources.filterAll", { count: total })}
                    aria-hidden={filter.state === null || undefined}
                    inert={filter.state === null || undefined}
                    tabIndex={filter.state === null ? -1 : undefined}
                    data-shown={filter.state === null ? undefined : ""}
                    onClick={filter.clear}
                    className={controlClass({
                      shape: "segment",
                      size: "xs",
                      tone: "muted",
                      hoverInk: "strong",
                      hoverSurface: "lift",
                      className: cn(
                        "flex-none px-1.5 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                        filter.state === null ? "opacity-0" : "opacity-100",
                      ),
                    })}
                  >
                    <X size={ICON_SIZE.sm} aria-hidden />
                  </button>
                </div>
              ) : (
                /* The legend's row is kept empty, so the statement stands at one height across folders. */
                <div aria-hidden data-testid="library-source-states-reserve" className="h-6" />
              )}
            </div>
          </div>

          {showChart ? (
            /* Change over time, the one thing the number cannot say; it steps aside when too narrow to read. */
            <div className="@container hidden min-w-0 max-w-[26rem] flex-1 @min-[60rem]:block">
              <div className="@max-[9rem]:hidden">
                <SourceProgressChart progress={progress} intro={intro} started={started} reduced={reduced} locale={locale} t={t} />
              </div>
            </div>
          ) : null}
        </div>

        <div
          data-testid="library-progress-action"
          className="flex min-w-0 flex-col justify-between gap-y-1.5 max-md:w-full md:flex-none @max-[60rem]:md:w-[17rem] @min-[60rem]:min-h-20 @min-[60rem]:w-[clamp(22.5rem,25vw,27.5rem)]"
        >
          {complete ? (
            <p data-testid="library-progress-done" className="flex min-h-10 items-center gap-2 text-body-lg leading-body-lg text-[color:var(--color-success-text-a94)]">
              <WorkGlyph phase="done" size={ICON_SIZE.md} />
              <span className="min-w-0 truncate">{t("progress.allDone")}</span>
            </p>
          ) : blocked && !inApp ? (
            <>
              <GetAppLink data-testid="library-progress-get-app" className="self-start">{t("wiki.compileWebGetApp")}</GetAppLink>
              <p data-testid="library-progress-blocked" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                {t("progress.webLine")}
              </p>
            </>
          ) : batch.next.length > 0 || running ? (
            /* The press, then who writes beside it; a note too long for the row takes the next line. */
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button
                size="md"
                data-testid="library-progress-continue"
                onClick={batch.start}
                onPointerEnter={() => setAimed(true)}
                onPointerLeave={() => setAimed(false)}
                onFocus={() => setAimed(true)}
                onBlur={() => setAimed(false)}
                disabled={blocked !== null || running}
                aria-describedby={blocked ? blockedId : undefined}
                className="atlas-touch-floor max-w-full"
              >
                {/* No ring in the button while work runs: the work line under it carries the ring. */}
                <span className="min-w-0 truncate">{t("progress.continue", { count: batch.next.length })}</span>
              </Button>
              {blocked?.door ?? null}
              {blocked ? (
                <p id={blockedId} title={blocked.reason} data-testid="library-progress-blocked" className="basis-full text-label leading-label text-[color:var(--color-text-tertiary)] @max-[60rem]:line-clamp-1 @min-[60rem]:line-clamp-2">
                  {blocked.reason}
                </p>
              ) : batch.returned > 0 && !running ? (
                <p
                  title={t("progress.batchReturned", { count: batch.returned })}
                  data-testid="library-progress-returned"
                  className="min-w-0 basis-full truncate text-label leading-label text-[color:var(--color-text-tertiary)]"
                >
                  {t("progress.batchReturned", { count: batch.returned })}
                </p>
              ) : (
                /* How many wait after this press is the Next to write panel's foot, so this line names who writes. */
                <p data-testid="library-progress-writer" className="min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
                  {agentName === null
                    ? t("progress.writerAnyAgent")
                    : t.rich("progress.writer", {
                        agent: agentName,
                        name: (chunks) => (
                          <span data-testid="library-progress-agent" className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                            {chunks}
                          </span>
                        ),
                      })}
                </p>
              )}
            </div>
          ) : null}
          {/* A refused press needs its two lines of reason, so the work line waits for the press to run. */}
          {blocked ? null : workLine}
        </div>
      </div>
    </section>
  );
}
