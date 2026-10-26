"use client";

import { FileText, Moon, Play, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { RoundPassEntry, RoundPassOutcome } from "@/entities/library-round";
import { undoneReasonKey } from "@/features/library-rounds";
import { Link } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Checkbox, Chip } from "@/shared/ui";

import { groupLedgerByDay, passDurationSeconds } from "../../../lib/rounds/round-presentation";
import { landInk } from "./landing";
import styles from "./rounds-ledger.module.css";

/**
 * **The ledger** — passes on a time axis, newest first.
 *
 * What is drawn is what changed. A pass that held is one quiet line on the axis so the eye
 * skips it; a pass that found something stale, wrote, refused or failed is a card with the
 * pages named as presses; sleep gaps can be included as hatched bands with their spans. n8n's execution log says
 * "37 succeeded"; this axis says which page became untrue at which hour, which is the thing a
 * person came back to learn.
 *
 * Motion: an entry that arrives while the ledger is on screen enters with the status motion
 * (`atlasStatusIn`, the usability family); entries present at mount are still. Reduced motion
 * draws them still.
 */

/**
 * A minute and more reads in minutes; under a minute keeps seconds, because there the seconds are
 * the information.
 */
function useDurationWords() {
  const t = useTranslations("library.rounds");
  return (seconds: number) => seconds >= 60
    ? t("ledger.durationMinutes", { minutes: Math.round(seconds / 60) })
    : t("ledger.duration", { seconds });
}

const DOT: Record<Exclude<RoundPassOutcome, "asleep">, string> = {
  held: "h-1.5 w-1.5 bg-[color:var(--color-text-quaternary)]",
  reviewed: "h-2 w-2 bg-[color:var(--color-indigo-text-soft)]",
  stale: "h-2 w-2 bg-[color:var(--color-status-warning)]",
  redrafted: "h-2 w-2 bg-[color:var(--color-indigo-text-soft)]",
  refused: "h-2 w-2 bg-[color:var(--color-status-danger)]",
  failed: "h-2 w-2 bg-[color:var(--color-status-danger)]",
};

const OUTCOME_BADGE: Record<Exclude<RoundPassOutcome, "asleep" | "held">, string> = {
  reviewed: "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]",
  stale: "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]",
  redrafted: "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]",
  refused: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
  failed: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
};

const ENTER = "motion-safe:animate-[atlasStatusIn_var(--motion-settle)_var(--motion-ease)_both]";

const LEDGER_ROW = "grid grid-cols-[3.5rem_1rem_minmax(0,1fr)] items-start gap-x-3";
const OUTCOME_SIGNALS = ["stale", "redrafted", "refused", "held"] as const;

function LedgerColumns() {
  const t = useTranslations("library.rounds");
  return (
    <div data-testid="library-rounds-ledger-head" className={cn(LEDGER_ROW, styles.head)}>
      <span>{t("ledger.columnTime")}</span>
      <span />
      <span className="flex items-baseline justify-between gap-4"><span>{t("ledger.columnRound")}</span><span>{t("ledger.columnOutcome")}</span></span>
    </div>
  );
}

/** The row the first pass lands in: a ghost before any round exists, then the round's own words. */
function LedgerWaitingRow({ ink, landed, children }: { ink: "ghost" | "live"; landed: boolean; children: ReactNode }) {
  const t = useTranslations("library.rounds");
  return (
    <div ref={landed ? landInk : undefined} data-testid="library-rounds-waiting-row" data-outcome="waiting" data-ink={ink} className={cn(
      LEDGER_ROW,
      ink === "ghost" ? "text-[color:var(--color-text-quaternary)]" : "text-[color:var(--color-text-primary)]",
    )}>
      <span className="sr-only">{t("ledger.ghostAria")}</span>
      <span aria-hidden data-ghost-text="" className="py-1.5 text-label leading-label tabular-nums">{t("ledger.ghostTime")}</span>
      <span className="flex justify-center py-2.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-current" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
        {children}
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
          {OUTCOME_SIGNALS.map((tone) => <span key={tone} data-signal={tone} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={styles.dot} data-tone={tone} />{t(`signal.${tone}`)}
          </span>)}
        </span>
      </div>
    </div>
  );
}

/** `wiki/payments-api.md` → `payments-api`: the name a person knows the page by. */
export function pageName(path: string): string {
  return path.replace(/^wiki\//, "").replace(/\.md$/, "");
}
/**
 * One chip for every press a pass names, in the morning card and the ledger alike: same glyph, type
 * step and padding. A press that goes somewhere other than a page passes its own glyph.
 */
export function RoundChip({
  label,
  ariaLabel,
  onClick,
  icon: Icon = FileText,
  testId,
}: {
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  icon?: LucideIcon;
  testId?: string;
}) {
  return (
    <Chip size="sm" onClick={onClick} aria-label={ariaLabel} data-testid={testId} data-round-chip="">
      <Icon size={ICON_SIZE.sm} aria-hidden />
      {label}
    </Chip>
  );
}

const pagesWritten = (entry: RoundPassEntry) => entry.written.filter((path) => path.startsWith("wiki/"));
/** A page that went stale and was redrafted in the same pass is one chip, the redraft. */
const staleNotRedrafted = (entry: RoundPassEntry) => {
  const redrafted = new Set(pagesWritten(entry).map((path) => path.replace(/\.md$/, "")));
  return entry.stale.filter((slug) => !redrafted.has(slug));
};
const sourcesWritten = (entry: RoundPassEntry) => entry.written.filter((path) => !path.startsWith("wiki/"));

/** The pass in flight, as the runner reports it. */
export interface RunningPass {
  roundId: string;
  roundName: string;
  startedAt: string;
  phase: "checking" | "agent";
}

/**
 * The live row: a pass in flight is on the axis while it runs, and the empty sentence yields to this
 * row.
 */
function LiveRow({ running, locale }: { running: RunningPass; locale: string }) {
  const t = useTranslations("library.rounds");
  // The caller keys this component on `startedAt`, so a new pass is a new mount and the
  // counter starts from the initial value rather than being reset inside an effect.
  const [seconds, setSeconds] = useState(() => elapsedSeconds(running.startedAt));
  useEffect(() => {
    const timer = setInterval(() => setSeconds(elapsedSeconds(running.startedAt)), 1_000);
    return () => clearInterval(timer);
  }, [running.startedAt]);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="relative" data-testid="library-rounds-ledger-live">
      <span aria-hidden className="absolute bottom-0 left-[calc(3.5rem+0.75rem+0.25rem-0.5px)] top-0 w-px bg-[color:var(--color-divider)]" />
      <li
        data-outcome="running"
        data-phase={running.phase}
        className={LEDGER_ROW}
      >
        <span className="py-1.5 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">
          {time.format(new Date(running.startedAt))}
        </span>
        <span className="flex justify-center py-2">
          <Play size={ICON_SIZE.sm} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
        </span>
        <p role="status" aria-live="polite" className="truncate py-1.5 text-body leading-body text-[color:var(--color-indigo-text-soft)]">
          {t("ledger.runningNow", {
            name: running.roundName,
            phase: running.phase === "agent" ? t("ledger.phaseAgent") : t("ledger.phaseChecking"),
            seconds,
          })}
        </p>
      </li>
    </ol>
  );
}

function elapsedSeconds(startedAt: string): number {
  const started = Date.parse(startedAt);
  return Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
}

export function RoundsLedger({
  entries,
  locale,
  onOpenPage,
  titleFor,
  running = null,
  nextDueLabel,
  allPaused,
  beforeFirstRound = false,
  landed = false,
}: {
  entries: readonly RoundPassEntry[];
  locale: string;
  onOpenPage: (slug: string) => void;
  /**
   * The title a person knows a page by. A chip reading `meeting-notes-summary` names a file;
   * the person named the page "Release readiness sync notes", and that is what they look for.
   * A page that is gone from the folder keeps its slug, which is still true.
   */
  titleFor?: (slug: string) => string;
  /** The pass in flight, drawn at the top of the axis while it runs. */
  running?: RunningPass | null;
  /** The first due time, for the empty line. */
  nextDueLabel: string | null;
  allPaused: boolean;
  beforeFirstRound?: boolean;
  landed?: boolean;
}) {
  const t = useTranslations("library.rounds");
  const durationWords = useDurationWords();
  const [showSleep, setShowSleep] = useState(false);
  const sleepCount = entries.filter((entry) => entry.outcome === "asleep").length;
  const visibleEntries = showSleep ? entries : entries.filter((entry) => entry.outcome !== "asleep");
  const pageTitle = (slug: string) => titleFor?.(slug) ?? pageName(slug);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" });

  /* Ids present at mount stay still; ids that arrive later enter with motion. */
  const knownRef = useRef<Set<string> | null>(null);
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (knownRef.current === null) {
      knownRef.current = new Set(entries.map((entry) => entry.id));
      return;
    }
    const fresh = entries.filter((entry) => !knownRef.current?.has(entry.id)).map((entry) => entry.id);
    if (fresh.length === 0) return;
    for (const id of fresh) knownRef.current.add(id);
    setArrived((current) => new Set([...current, ...fresh]));
  }, [entries]);

  const days = groupLedgerByDay(visibleEntries);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayLabel = (date: Date) =>
    date.getTime() === today.getTime() ? t("ledger.today") : date.getTime() === yesterday.getTime() ? t("ledger.yesterday") : dayFormat.format(date);

  return (
    <section aria-label={t("ledger.aria")} data-testid="library-rounds-ledger">
      {sleepCount > 0 ? (
        <div className="mb-3 flex flex-wrap justify-end">
          <Checkbox
            label={t("ledger.includeSleep", { count: sleepCount })}
            checked={showSleep}
            onChange={(event) => setShowSleep(event.target.checked)}
            data-testid="library-rounds-show-sleep"
            className="atlas-touch-floor"
          />
        </div>
      ) : null}
      <LedgerColumns />
      <div className="mt-2 flex flex-col gap-6">
        {running ? <LiveRow key={running.startedAt} running={running} locale={locale} /> : null}
        {visibleEntries.length === 0 && !running ? (
          <LedgerWaitingRow ink={beforeFirstRound ? "ghost" : "live"} landed={landed}>
            <p data-testid="library-rounds-ledger-empty" className="min-w-0 text-body leading-body">
              {beforeFirstRound ? t("ledger.noPasses") : allPaused ? t("ledger.emptyPaused") : nextDueLabel ? t("ledger.empty", { time: nextDueLabel }) : t("ledger.emptyPaused")}
            </p>
          </LedgerWaitingRow>
        ) : null}
        {days.map((day) => (
          <div key={day.key} data-ledger-day={day.key}>
            <h3 className="mb-2 text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
              {dayLabel(day.date)}
            </h3>
            <ol className="relative">
              {/* The axis: one hairline behind every dot of this day. */}
              <span aria-hidden className="absolute bottom-0 left-[calc(3.5rem+0.75rem+0.25rem-0.5px)] top-0 w-px bg-[color:var(--color-divider)]" />
              {day.entries.map((entry) => (
                <li
                  key={entry.id}
                  id={`library-rounds-pass-${entry.id}`}
                  data-testid={`library-rounds-pass-${entry.id}`}
                  data-outcome={entry.outcome}
                  tabIndex={-1}
                  className={cn(LEDGER_ROW, arrived.has(entry.id) && ENTER)}
                >
                  {entry.outcome === "asleep" ? (
                    <>
                      <span className="pt-2 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{time.format(new Date(entry.endedAt))}</span>
                      <span className="flex justify-center pt-2">
                        <Moon size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
                      </span>
                      {/*
                        One inner edge and one type step down this column. Measured at 1512
                        before this: the card's text began at 489, this band's at 484 and the
                        held line's at 472 — three starts inside one column, and the band was
                        11px where the held line beside it was 12.5 (`docs/DESIGN-SYSTEM.md`,
                        "One text edge per column"). The band now wears the card's own
                        `--card-pad` horizontally and the held line's step; quiet is carried
                        by the quaternary ink, which is where quiet belongs.
                      */}
                      <div className="my-1 border-y border-dashed border-[color:var(--color-divider)] bg-[repeating-linear-gradient(135deg,var(--color-overlay-1)_0_6px,transparent_6px_12px)] px-[var(--card-pad)] py-1.5 text-body leading-body text-[color:var(--color-text-quaternary)]">
                        {t("ledger.asleep")} · {t("since.span", { from: time.format(new Date(entry.startedAt)), to: time.format(new Date(entry.endedAt)) })}
                      </div>
                    </>
                  ) : entry.outcome === "held" ? (
                    <>
                      <span className="py-1.5 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{time.format(new Date(entry.endedAt))}</span>
                      <span className="flex justify-center py-2.5">
                        <span className={cn("rounded-full", DOT.held)} />
                      </span>
                      <p className="truncate py-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">
                        {t("ledger.heldLine", { name: entry.roundName ?? "", checked: t("ledger.checked", { count: entry.checked }) })}
                        {entry.trigger !== "clock" ? ` · ${entry.trigger === "manual" ? t("ledger.manual") : t("ledger.catchUp")}` : null}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="pt-3 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{time.format(new Date(entry.endedAt))}</span>
                      <span className="flex justify-center pt-[0.9rem]">
                        <span className={cn("rounded-full", DOT[entry.outcome])} />
                      </span>
                      <article className="my-1 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-body leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                            {entry.roundName}
                          </span>
                          <span className={badgeClass({ shape: "micro", className: cn("border", OUTCOME_BADGE[entry.outcome]) })}>
                            {entry.outcome === "stale"
                              ? t("outcome.stale", { count: entry.stale.length })
                              : entry.outcome === "redrafted"
                                ? t("outcome.redrafted", { count: pagesWritten(entry).length })
                                : t(`outcome.${entry.outcome}`)}
                          </span>
                          {/* A pass under a second says nothing about its length: "0 s" is not a
                              duration a person can use, and it read as a defect beside a real one. */}
                          <span className="text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">
                            {passDurationSeconds(entry) > 0 ? `${durationWords(passDurationSeconds(entry))} · ` : null}
                            {entry.agentTurns === 1 ? t("ledger.agentTurn") : t("ledger.noAgentTurn")}
                            {entry.trigger !== "clock" ? ` · ${entry.trigger === "manual" ? t("ledger.manual") : t("ledger.catchUp")}` : null}
                          </span>
                        </div>
                        <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
                          {entry.outcome === "failed" && entry.summary
                            ? entry.summary === "no-manifest" ? t("ledger.failedFolderNotRead") : t("ledger.failedError", { detail: entry.summary })
                            : <>{t("ledger.checked", { count: entry.checked })}{entry.summary ? ` · ${entry.summary}` : null}</>}
                        </p>
                        {entry.undone?.length ? (
                          <p data-testid="library-rounds-undone" className="mt-2 text-body leading-body text-[color:var(--color-amber-source-a90)]">
                            {entry.undone.map((item) => `${item.action === "left" ? t("ledger.leftAsIs", { page: item.path }) : t(`ledger.undone.${item.action}`, { page: item.path })} ${t(`ledger.undoneReason.${undoneReasonKey(item.reason)}`, { key: item.key ?? "" })}${item.copy ? ` ${t("ledger.undoneCopy", { copy: item.copy })}` : ""}`).join(" ")}
                          </p>
                        ) : null}
                        {entry.leftAsIs?.length ? (
                          <p data-testid="library-rounds-left-as-is" className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                            {entry.leftAsIs.map((page) => t("ledger.leftAsIs", { page })).join(" ")}
                          </p>
                        ) : null}
                        {entry.stale.length > 0 || pagesWritten(entry).length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {staleNotRedrafted(entry).map((slug) => (
                              <RoundChip key={`stale-${slug}`} onClick={() => onOpenPage(slug)} label={pageTitle(slug)}
                                ariaLabel={t("since.openPage", { page: pageTitle(slug) })} />
                            ))}
                            {pagesWritten(entry).map((path) => (
                              <RoundChip key={`written-${path}`} onClick={() => onOpenPage(path.replace(/\.md$/, ""))}
                                label={pageTitle(path)} ariaLabel={t("since.openPage", { page: pageTitle(path) })} />
                            ))}
                          </div>
                        ) : null}
                        {sourcesWritten(entry).length > 0 ? (
                          <p className="mt-2 truncate text-label leading-label text-[color:var(--color-text-tertiary)]" title={sourcesWritten(entry).join(", ")}>
                            {t("ledger.wrote")}: {sourcesWritten(entry).join(", ")}
                          </p>
                        ) : null}
                        {entry.note === "no-agent" ? (
                          <p className="mt-2 text-label leading-label text-[color:var(--color-amber-source-a90)]">
                            {t("ledger.noAgent")}{" "}
                            <Link href={DESTINATION_HREF.agents} className={controlClass({ shape: "link", size: "md", tone: "accent" })}>{t("ledger.openAgents")}</Link>
                          </p>
                        ) : null}
                        {entry.note === "stopped" ? (
                          <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t("ledger.stopped")}</p>
                        ) : null}
                        {entry.refused.length > 0 ? (
                          <p className="mt-2 truncate text-label leading-label text-[color:var(--color-danger-text)]">
                            {t("ledger.refused")}: {entry.refused.join(", ")}
                          </p>
                        ) : null}
                        {entry.called.length > 0 ? (
                          <p className="mt-1 truncate text-label leading-label text-[color:var(--color-text-quaternary)]" title={entry.called.join(", ")}>
                            {t("ledger.called")}: {entry.called.map((tool) => tool.replace(/^mcp__[^_]+(?:-[^_]+)*__/, "")).join(", ")}
                          </p>
                        ) : null}
                      </article>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
