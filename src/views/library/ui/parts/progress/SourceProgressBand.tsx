"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { deriveSourceProgress, type LibrarySourceRow } from "@/entities/docs-vault";
import { usePrefersReducedMotion } from "@/shared/lib/render-timing/use-prefers-reduced-motion";
import { WorkGlyph } from "@/shared/motion/work-glyph";
import { Button } from "@/shared/ui";
import { GetAppLink } from "@/shared/ui/controls/get-app-link";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { PROGRESS_COMPLETE_INK, PROGRESS_SEGMENTS as SEGMENTS } from "./progress-inks";
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

/**
 * How many sources have a wiki page, since when, and the press that writes the next ones: one row
 * above the Sources home's graph, at most 112px tall. On a folder's first visit in a session the
 * percent, the sentence's count, the bar and the chart count up together, so no frame shows one
 * number beside another; until the count starts they are not drawn. Later changes move on from what
 * is drawn.
 */
export function SourceProgressBand({
  sources,
  vaultScope,
  batch,
  blocked,
  inApp,
  locale,
  t,
}: {
  sources: LibrarySourceRow[];
  vaultScope: string;
  batch: ContinueBatch;
  /** Null when Continue can run. */
  blocked: ContinueBlocked | null;
  inApp: boolean;
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

  const percentText = useCallback(
    (share: number) => {
      if (underOnePercent) return t("progress.underOne");
      const drawn = Math.floor(share * 100 + 1e-6);
      return t("progress.percent", { percent: complete ? drawn : Math.min(drawn, 99) });
    },
    [complete, t, underOnePercent],
  );

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
    const nextPercent = settled ? (underOnePercent ? t("progress.underOne") : t("progress.percent", { percent })) : percentText(drawn[0] ?? 0);
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
  const finalPercent = underOnePercent ? t("progress.underOne") : t("progress.percent", { percent });
  const showChart = progress.series.length > 0 || progress.undated > 0;
  const running = batch.running.size > 0;
  const blockedId = "library-progress-blocked";

  return (
    <section
      aria-label={t("progress.aria")}
      data-testid="library-progress"
      data-percent={percent}
      data-complete={complete ? "" : undefined}
      className="flex flex-none items-center gap-x-6 gap-y-2 border-b border-[color:var(--color-border-soft)] px-5 py-2.5 max-md:flex-wrap sm:px-6 md:max-h-[112px] md:px-10"
    >
      <div className="flex min-w-0 flex-col gap-1 max-md:min-w-[10rem] max-md:flex-1 md:w-[clamp(13rem,26%,19rem)] md:flex-none">
        <div
          className="flex min-w-0 flex-col gap-1 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          style={started ? undefined : { opacity: 0 }}
        >
        <p className="flex min-w-0 items-baseline gap-2">
          <span
            ref={percentRef}
            aria-hidden
            data-testid="library-progress-percent"
            className="text-display leading-display-tight font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-primary)]"
          >
            <FirstText text={intro ? (underOnePercent ? finalPercent : t("progress.percent", { percent: 0 })) : finalPercent} />
          </span>
          <span className="sr-only">{finalPercent}</span>
          {today > 0 ? (
            <span
              ref={todayRef}
              data-testid="library-progress-today"
              className="motion-swap-in text-label leading-body tabular-nums text-[color:var(--color-indigo-accent)]"
            >
              <FirstText text={t("progress.today", { count: intro ? 0 : today })} />
            </span>
          ) : null}
        </p>
        {/* While counting, the sentence is drawn with the percent; a new element takes over once it settles. */}
        <p
          key={counting ? "counting" : "settled"}
          ref={counting ? sentenceRef : undefined}
          aria-hidden={counting || undefined}
          data-testid="library-progress-sentence"
          className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-secondary)]"
        >
          {counting ? <FirstText text={sentenceFor(0)} /> : sentence}
        </p>
        {counting ? <span className="sr-only">{sentence}</span> : null}
        </div>
        <span
          aria-hidden
          data-testid="library-progress-bar"
          className="relative mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
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
      </div>

      {showChart ? (
        <div className="min-w-[200px] flex-1 max-md:hidden md:max-w-[26rem]">
          <SourceProgressChart progress={progress} intro={intro} started={started} reduced={reduced} locale={locale} t={t} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col items-start gap-1 md:min-w-[14rem] md:flex-1">
        {complete ? (
          <p data-testid="library-progress-done" className="flex items-center gap-1.5 text-label leading-body text-[color:var(--color-success-text-a94)]">
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
      </div>
    </section>
  );
}
