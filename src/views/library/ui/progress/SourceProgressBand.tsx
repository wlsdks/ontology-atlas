"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { deriveSourceProgress, type LibrarySourceRow } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { cn } from "@/shared/lib/cn";
import {
  drawnSourceShare,
  formatSourceShare,
  segmentClip,
  SOURCE_STATE_ORDER,
  sourceShare,
  sourceStateFill,
} from "@/widgets/library-sources-overview";

import { nextBatchEnd, showsProgressChart, stateBoundaries } from "../../model/progress/source-progress-shapes";
import { useLocalNoon } from "../../model/progress/use-local-noon";
import type { ContinueBatch, ContinueBlocked } from "../../model/sources/continue-batch";
import type { SourceStateFilter } from "../../model/sources/use-source-filter";
import { FirstText } from "./FirstText";
import { ProgressAction } from "./ProgressAction";
import { SourceProgressChart } from "./SourceProgressChart";
import { SourceStateLegend } from "./SourceStateLegend";
import { useBandMotion } from "./use-band-motion";
import { useTextCut } from "./use-text-cut";

/** Folders whose band already counted up this session; a later visit draws the values at once. */
const counted = new Set<string>();
/** The longest a first open waits for hashing before it counts up anyway. */
const INTRO_WAIT_MS = 1200;
/** Folders whose bar already carried the light at 100% this session. */
const lit = new Set<string>();

/**
 * How far the folder's sources are into wiki pages, and the press that writes the next ones: one row,
 * one height from `md`, so the pane under it never moves. On a folder's first visit in a session the
 * number, sentence count, bar and chart count up together, so no frame shows one number beside another.
 */
export function SourceProgressBand({
  sources,
  vaultScope,
  batch,
  blocked,
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
  const noon = useLocalNoon();
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
  const boundaries = stateBoundaries(byState, total);

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
  const showChart = showsProgressChart(progress.series);
  const running = batch.running.size > 0;
  // Pointing at Continue, or focusing it, shows on the bar how far its sources would take the first segment.
  const [aimed, setAimed] = useState(false);
  const nextShown = aimed && blocked === null && !running && batch.next.length > 0;
  const pageEnd = boundaries[0] ?? 0;
  const nextEnd = nextBatchEnd(pageEnd, batch.next.length, total);
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
                <SourceStateLegend
                  presses={presses}
                  byState={byState}
                  total={total}
                  complete={complete}
                  compact={compactPresses}
                  filter={filter}
                  grouped={grouped}
                  t={t}
                />
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

        <ProgressAction
          complete={complete}
          blocked={blocked}
          batch={batch}
          running={running}
          agentName={agentName}
          workLine={workLine}
          onAimChange={setAimed}
          t={t}
        />
      </div>
    </section>
  );
}
