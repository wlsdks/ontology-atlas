"use client";

import { FileText, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { RoundPassEntry, RoundPassOutcome } from "@/entities/library-round";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Chip } from "@/shared/ui";

import { groupLedgerByDay, passDurationSeconds } from "../../lib/round-presentation";

/**
 * **The ledger** — passes on a time axis, newest first.
 *
 * What is drawn is what changed. A pass that held is one quiet line on the axis so the eye
 * skips it; a pass that found something stale, wrote, refused or failed is a card with the
 * pages named as presses; a sleep gap is a hatched band with its span. n8n's execution log says
 * "37 succeeded"; this axis says which page became untrue at which hour, which is the thing a
 * person came back to learn.
 *
 * Motion: an entry that arrives while the ledger is on screen enters with the status motion
 * (`atlasStatusIn`, the usability family); entries present at mount are still. Reduced motion
 * draws them still.
 */

const DOT: Record<Exclude<RoundPassOutcome, "asleep">, string> = {
  held: "h-1.5 w-1.5 bg-[color:var(--color-text-quaternary)]",
  stale: "h-2 w-2 bg-[color:var(--color-status-warning)]",
  redrafted: "h-2 w-2 bg-[color:var(--color-indigo-text-soft)]",
  refused: "h-2 w-2 bg-[color:var(--color-status-danger)]",
  failed: "h-2 w-2 bg-[color:var(--color-status-danger)]",
};

const OUTCOME_BADGE: Record<Exclude<RoundPassOutcome, "asleep" | "held">, string> = {
  stale: "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]",
  redrafted: "border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]",
  refused: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
  failed: "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]",
};

const ENTER = "motion-safe:animate-[atlasStatusIn_var(--motion-settle)_var(--motion-ease)_both]";

/** `wiki/payments-api.md` → `payments-api`: the name a person knows the page by. */
export function pageName(path: string): string {
  return path.replace(/^wiki\//, "").replace(/\.md$/, "");
}
const pagesWritten = (entry: RoundPassEntry) => entry.written.filter((path) => path.startsWith("wiki/"));
/** A page that went stale and was redrafted in the same pass is one chip, the redraft. */
const staleNotRedrafted = (entry: RoundPassEntry) => {
  const redrafted = new Set(pagesWritten(entry).map((path) => path.replace(/\.md$/, "")));
  return entry.stale.filter((slug) => !redrafted.has(slug));
};
const sourcesWritten = (entry: RoundPassEntry) => entry.written.filter((path) => !path.startsWith("wiki/"));

export function RoundsLedger({
  entries,
  locale,
  onOpenPage,
  nextDueLabel,
  allPaused,
}: {
  entries: readonly RoundPassEntry[];
  locale: string;
  onOpenPage: (slug: string) => void;
  /** The first due time, for the empty line. */
  nextDueLabel: string | null;
  allPaused: boolean;
}) {
  const t = useTranslations("library.rounds");
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

  if (entries.length === 0) {
    return (
      <p data-testid="library-rounds-ledger-empty" className="text-body leading-body text-[color:var(--color-text-tertiary)]">
        {allPaused ? t("ledger.emptyPaused") : nextDueLabel ? t("ledger.empty", { time: nextDueLabel }) : t("ledger.emptyPaused")}
      </p>
    );
  }

  const days = groupLedgerByDay(entries);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayLabel = (date: Date) =>
    date.getTime() === today.getTime() ? t("ledger.today") : date.getTime() === yesterday.getTime() ? t("ledger.yesterday") : dayFormat.format(date);

  return (
    <section aria-label={t("ledger.aria")} data-testid="library-rounds-ledger" className="flex flex-col gap-6">
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
                data-testid={`library-rounds-pass-${entry.id}`}
                data-outcome={entry.outcome}
                className={cn("grid grid-cols-[3.5rem_1rem_minmax(0,1fr)] items-start gap-x-3", arrived.has(entry.id) && ENTER)}
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
                          {passDurationSeconds(entry) > 0 ? `${t("ledger.duration", { seconds: passDurationSeconds(entry) })} · ` : null}
                          {entry.agentTurns === 1 ? t("ledger.agentTurn") : t("ledger.noAgentTurn")}
                          {entry.trigger !== "clock" ? ` · ${entry.trigger === "manual" ? t("ledger.manual") : t("ledger.catchUp")}` : null}
                        </span>
                      </div>
                      <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
                        {t("ledger.checked", { count: entry.checked })}
                        {entry.summary ? ` · ${entry.summary}` : null}
                      </p>
                      {entry.stale.length > 0 || pagesWritten(entry).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {staleNotRedrafted(entry).map((slug) => (
                            <Chip key={`stale-${slug}`} size="sm" onClick={() => onOpenPage(slug)} aria-label={t("since.openPage", { page: pageName(slug) })}>
                              <span className={cn("rounded-full", DOT.stale)} aria-hidden />
                              {pageName(slug)}
                            </Chip>
                          ))}
                          {pagesWritten(entry).map((path) => (
                            <Chip
                              key={`written-${path}`}
                              size="sm"
                              onClick={() => onOpenPage(path.replace(/\.md$/, ""))}
                              aria-label={t("since.openPage", { page: pageName(path) })}
                            >
                              <FileText size={ICON_SIZE.sm} aria-hidden />
                              {pageName(path)}
                            </Chip>
                          ))}
                        </div>
                      ) : null}
                      {sourcesWritten(entry).length > 0 ? (
                        <p className="mt-2 truncate text-label leading-label text-[color:var(--color-text-tertiary)]" title={sourcesWritten(entry).join(", ")}>
                          {t("ledger.wrote")}: {sourcesWritten(entry).join(", ")}
                        </p>
                      ) : null}
                      {entry.note === "no-agent" ? (
                        <p className="mt-2 text-label leading-label text-[color:var(--color-amber-source-a90)]">{t("ledger.noAgent")}</p>
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
    </section>
  );
}
