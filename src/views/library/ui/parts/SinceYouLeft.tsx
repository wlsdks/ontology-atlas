"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Chip } from "@/shared/ui";

import type { SinceSpan, SinceSummary } from "../../lib/round-presentation";
import { pageName } from "./RoundsLedger";

/**
 * **The morning card** — the one surface that wins attention on the Rounds tab.
 *
 * The person and moment (spec §1): 09:02, the app was open all night, "what became untrue
 * while I was away, and what is already fixed?" This card answers in at most four lines,
 * each naming pages as presses. When nothing changed it says so in one quiet line rather
 * than drawing four empty rows, so a calm night reads as calm.
 *
 * Stillness on purpose: no motion here. The ledger below is where a live pass arrives.
 */
export function SinceYouLeft({
  span,
  summary,
  locale,
  onOpenPage,
}: {
  span: SinceSpan;
  summary: SinceSummary;
  locale: string;
  onOpenPage: (slug: string) => void;
}) {
  const t = useTranslations("library.rounds");
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const dayTime = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const crossesDay = span.from.toDateString() !== span.to.toDateString();
  const fromLabel = crossesDay ? dayTime.format(span.from) : time.format(span.from);
  const toLabel = time.format(span.to);
  const changed = summary.stale.length > 0 || summary.redrafted.length > 0 || summary.refused > 0 || summary.failed > 0;

  return (
    <section
      data-testid="library-rounds-since"
      data-since-kind={span.kind}
      data-since-changed={changed}
      aria-labelledby="library-rounds-since-title"
      className={cn(
        "rounded-panel border bg-[color:var(--color-panel)] p-[var(--card-pad)]",
        changed ? "border-[color:var(--color-border-strong)]" : "border-[color:var(--color-divider)]",
      )}
    >
      <p className="text-caption leading-caption font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-indigo-text-soft)]">
        {span.kind === "away" ? t("since.title") : t("since.todayTitle")}
      </p>
      <h2 id="library-rounds-since-title" className="mt-1 text-title leading-title font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
        {t("since.span", { from: fromLabel, to: toLabel })}
      </h2>

      {summary.passes === 0 ? (
        <p className="mt-3 text-body-lg leading-title text-[color:var(--color-text-tertiary)]">{t("since.noPasses")}</p>
      ) : !changed ? (
        <p className="mt-3 text-body-lg leading-title text-[color:var(--color-text-tertiary)]">{t("since.nothing", { count: summary.passes })}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {summary.stale.length > 0 ? (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-2 text-body-lg leading-title text-[color:var(--color-text-primary)]">
                <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--color-status-warning)]" />
                {t("since.stale", { count: summary.stale.length })}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {summary.stale.map((slug) => (
                  <Chip key={slug} size="sm" onClick={() => onOpenPage(slug)} aria-label={t("since.openPage", { page: pageName(slug) })}>
                    {pageName(slug)}
                  </Chip>
                ))}
              </span>
            </li>
          ) : null}
          {summary.redrafted.length > 0 ? (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-2 text-body-lg leading-title text-[color:var(--color-text-primary)]">
                <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--color-indigo-text-soft)]" />
                {t("since.redrafted", { count: summary.redrafted.length })}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {summary.redrafted.map((path) => (
                  <Chip
                    key={path}
                    size="sm"
                    onClick={() => onOpenPage(path.replace(/\.md$/, ""))}
                    aria-label={t("since.openPage", { page: pageName(path) })}
                  >
                    <FileText size={ICON_SIZE.sm} aria-hidden />
                    {pageName(path)}
                  </Chip>
                ))}
              </span>
            </li>
          ) : null}
          {summary.refused > 0 ? (
            <li className="inline-flex items-center gap-2 text-body leading-body text-[color:var(--color-danger-text)]">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--color-status-danger)]" />
              {t("since.refused", { count: summary.refused })}
            </li>
          ) : null}
          {summary.failed > 0 ? (
            <li className="inline-flex items-center gap-2 text-body leading-body text-[color:var(--color-danger-text)]">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--color-status-danger)]" />
              {t("since.failed", { count: summary.failed })}
            </li>
          ) : null}
          {summary.held > 0 ? (
            <li className="inline-flex items-center gap-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
              {/* The same dot step as the three lines above it. A 6px dot put this line's first
                  glyph at 407 where the others began at 409 — a broken start line bought for a
                  quiet this line already has in its ink. */}
              <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--color-text-quaternary)]" />
              {t("since.held", { count: summary.held })}
            </li>
          ) : null}
        </ul>
      )}
      {summary.asleep.length > 0 ? (
        <p className="mt-3 text-label leading-label text-[color:var(--color-text-quaternary)]">
          {summary.asleep.map((gap) => t("since.asleep", { from: time.format(gap.from), to: time.format(gap.to) })).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
