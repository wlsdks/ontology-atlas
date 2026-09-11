"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { useTranslations } from "next-intl";

import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";
import { Chip, Tooltip } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { localizeWikiLogSummary } from "../../lib/wiki-log-summary";

/**
 * **What the last check found, as a page in the reading pane.**
 *
 * Owner direction 2026-09-07 (design round, direction B): the index column is an index —
 * switch, search, one door row, the list — and the check's findings and the names
 * without a page are content, so they read where content reads: in the pane, at the
 * pane's width, with a heading per kind and every summary whole. In the 280px column
 * they were three-line clips that pushed the page list off the screen (measured on the
 * installed app with six findings and seven names).
 *
 * Every row keeps its one door: **Fix** starts the turn that corrects a finding on the
 * pages it names; **Propose** starts the turn that adds a map node for a name. Both are
 * agent turns and both land the way the person's write setting says. The head repeats
 * the app's own record of the last check (`wiki/_log.md`), so the page says when these
 * facts were true.
 */

/** Names past this many fold behind a count; the map kinds come first. */
const CANDIDATE_FOLD = 5;

const FINDING_ORDER: ReadonlyArray<LintFinding["code"]> = ["disagreement", "superseded", "missing-link"];

function findingKindKey(code: LintFinding["code"]): "disagreement" | "superseded" | "missingLink" {
  return code === "missing-link" ? "missingLink" : code;
}

function logWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The report's sections, in reading order, as the outline rail lists them: one per kind
 * that has findings, then the names. The page builds the rail from this so the rail and
 * the page cannot disagree about what is on it.
 */
export function reportOutline(
  findings: readonly LintFinding[],
  candidateCount: number,
  t: ReturnType<typeof useTranslations<"library">>,
): Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> {
  const out: Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> = [];
  for (const code of FINDING_ORDER) {
    const count = findings.filter((finding) => finding.code === code).length;
    if (count === 0) continue;
    out.push({ slug: `report-${code}`, text: `${t(`wiki.findingKind.${findingKindKey(code)}`)} ${count}`, depth: 2, occurrence: 1, duplicate: false });
  }
  if (candidateCount > 0) {
    out.push({ slug: "report-names", text: `${t("report.namesTitle")} ${candidateCount}`, depth: 2, occurrence: 1, duplicate: false });
  }
  return out;
}

/** One finding's identity across a turn: its kind, its pages, its sentence. */
export function findingKey(finding: LintFinding): string {
  return `${finding.code}\u241f${finding.pages.join(",")}\u241f${finding.summary}`;
}

function pageName(slug: string): string {
  return slug.replace(/^wiki\//, "");
}

export function LibraryCheckReport({
  findings,
  candidates,
  lastLint,
  busy,
  onLint,
  onFix,
  onPropose,
  onOpenPage,
  fixedKeys,
  t,
}: {
  findings: readonly LintFinding[];
  candidates: readonly LintNodeCandidate[];
  /** The app's record of the last check, or null when the wiki was never checked. */
  lastLint: { at: string; summary: string } | null;
  busy: boolean;
  /** Starts a check; null when no agent can run one here. */
  onLint: (() => void) | null;
  onFix: ((finding: LintFinding) => void) | null;
  onPropose: ((candidate: LintNodeCandidate) => void) | null;
  onOpenPage: (slug: string) => void;
  /** Keys (`findingKey`) of the findings a Fix turn completed since the last check. */
  fixedKeys?: ReadonlySet<string>;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const orderedCandidates = [...candidates].sort(
    (a, b) => Number(isMapKind(b.kind)) - Number(isMapKind(a.kind)),
  );
  const shownCandidates = candidatesOpen ? orderedCandidates : orderedCandidates.slice(0, CANDIDATE_FOLD);
  const foldedCandidates = orderedCandidates.length - shownCandidates.length;
  const groups = FINDING_ORDER.map((code) => ({
    code,
    rows: findings.filter((finding) => finding.code === code),
  })).filter((group) => group.rows.length > 0);
  const empty = findings.length === 0 && candidates.length === 0;
  /*
   * What a check found lives in memory for the session; the app's log keeps only the
   * counts. So an empty page under a log line that counts findings is not "nothing to
   * fix" — it is a page reopened after the app was (measured on the installed app,
   * council 2026-09-07) — and it says so.
   */
  const lastCheckFoundSomething = !!lastLint && /(?:^|\D)[1-9]\d*/.test(lastLint.summary);

  return (
    <article data-testid="library-check-report" className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-[var(--page-bottom-breath)] pt-8 md:px-10">
      <header>
        <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
          {t("report.title")}
        </h2>
        <p
          data-testid="library-check-report-when"
          className="mt-1.5 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {lastLint
            ? t("wiki.logLint", { when: logWhen(lastLint.at), summary: localizeWikiLogSummary(lastLint.summary, t) })
            : t("report.never")}
        </p>
      </header>

      {empty ? (
        <div className="mt-8 flex flex-col items-start gap-3">
          {/* The lede, a finding's sentence and the candidates note are read as lines, so they
              take `--measure-prose`; the report's own column stays `--measure-doc-column`
              (2026-09-11 calibration — `app/globals.css`, `--measure-prose`). */}
          <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {lastLint ? (lastCheckFoundSomething ? t("report.gone") : t("report.clean")) : t("report.emptyLede")}
          </p>
          {onLint ? (
            <Chip data-testid="library-check-report-lint" onClick={onLint} disabled={busy} tone="secondary" hoverInk="strong">
              <Stethoscope size={ICON_SIZE.sm} aria-hidden />
              <span>{t("wiki.lint")}</span>
            </Chip>
          ) : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.code} data-testid={`library-check-report-${group.code}`} className="mt-10">
          <h3
            id={`report-${group.code}`}
            className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
          >
            {t(`wiki.findingKind.${findingKindKey(group.code)}`)}
            <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
              {group.rows.length}
            </span>
          </h3>
          <ul className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">
            {group.rows.map((finding, index) => (
              <li
                key={`${findingKey(finding)}${index}`}
                data-testid="library-finding"
                data-state={fixedKeys?.has(findingKey(finding)) ? "fixed" : undefined}
                className="flex min-w-0 items-start gap-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
                    {finding.summary}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {finding.pages.map((slug, pageIndex) => (
                      <span key={slug} className="inline-flex items-center gap-x-1.5">
                        {pageIndex > 0 ? <span aria-hidden>·</span> : null}
                        <button
                          type="button"
                          data-testid="library-finding-page"
                          onClick={() => onOpenPage(slug)}
                          className={controlClass({
                            shape: "link",
                            size: "sm",
                            tone: "muted",
                            hoverInk: "strong",
                            className: "atlas-touch-floor underline decoration-[color:var(--color-indigo-line-a40)] underline-offset-2",
                          })}
                        >
                          {pageName(slug)}
                        </button>
                      </span>
                    ))}
                  </p>
                </div>
                {fixedKeys?.has(findingKey(finding)) ? (
                  /* A Fix turn ended on this one: the row says so until the next check
                     re-judges the pages (design-interaction, council 2026-09-07). */
                  <span
                    data-testid="library-finding-fixed"
                    className="flex-none pt-1 text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
                  >
                    {t("report.fixed")}
                  </span>
                ) : onFix ? (
                  <Tooltip content={t("wiki.fixTooltip")}>
                    <Chip
                      data-testid="library-finding-fix"
                      onClick={() => onFix(finding)}
                      disabled={busy}
                      tone="secondary"
                      hoverInk="strong"
                      className="atlas-touch-floor-wide flex-none"
                      aria-label={`${t("wiki.fix")}: ${finding.summary}`}
                    >
                      {t("wiki.fix")}
                    </Chip>
                  </Tooltip>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {candidates.length > 0 ? (
        <section data-testid="library-candidates" className="mt-10">
          <h3
            id="report-names"
            className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
          >
            {t("report.namesTitle")}
            <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
              {candidates.length}
            </span>
          </h3>
          <p className="mt-1 max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
            {t("wiki.candidatesTooltip")}
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">
            {shownCandidates.map((candidate) => (
              <li
                key={`${candidate.name}${candidate.pages.join(",")}`}
                data-testid="library-candidate"
                className="flex min-w-0 items-center gap-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]" title={candidate.why || undefined}>
                    {candidate.name}
                  </p>
                  <p className="mt-0.5 text-caption text-[color:var(--color-text-quaternary)]">
                    {t(`wiki.candidateKind.${candidate.kind}`)} · {t("wiki.candidatePages", { count: candidate.pages.length })}
                  </p>
                </div>
                {onPropose && isMapKind(candidate.kind) ? (
                  <Tooltip content={t("wiki.proposeTooltip")}>
                    <Chip
                      data-testid="library-candidate-propose"
                      onClick={() => onPropose(candidate)}
                      disabled={busy}
                      tone="secondary"
                      hoverInk="strong"
                      className="atlas-touch-floor-wide flex-none"
                      aria-label={`${t("wiki.propose")}: ${candidate.name}`}
                    >
                      {t("wiki.propose")}
                    </Chip>
                  </Tooltip>
                ) : null}
              </li>
            ))}
          </ul>
          {foldedCandidates > 0 || candidatesOpen ? (
            <Chip
              data-testid="library-candidates-fold"
              tone="muted"
              hoverInk="strong"
              className="mt-2"
              onClick={() => setCandidatesOpen((open) => !open)}
              aria-expanded={candidatesOpen}
            >
              {candidatesOpen ? t("wiki.candidatesLess") : t("wiki.candidatesMore", { count: foldedCandidates })}
            </Chip>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
