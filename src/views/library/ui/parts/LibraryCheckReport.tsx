"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { useTranslations } from "next-intl";

import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";
import type { WikiReport, WikiReportRow } from "@/shared/lib/wiki-report.mjs";
import { Chip, Tooltip } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { localizeWikiLogSummary } from "../../lib/wiki-log-summary";

/**
 * **What the check found, as a page in the reading pane — two ledgers, the computed one
 * first.**
 *
 * Owner direction 2026-09-07 (design round, direction B) put the findings in the pane
 * rather than the 280px index column: in the column they were three-line clips that
 * pushed the page list off the screen. Owner selection 2026-09-12 (`/design-directions`
 * direction B, licensed by `docs/DECISIONS.md` 2026-09-11 "The Library keeps its spine,
 * and computes the structural check itself") decides what the pane holds.
 *
 * ⚠️ **The page used to be one ledger, and it was the agent's.** Every row came from the
 * last agent turn, held in memory for the session, and after a restart the page printed
 * *"what the last check found does not survive reopening the app"* — under a head that was
 * still counting those findings, because `wiki/_log.md` keeps the counts. Measured on the
 * installed app (`.claude/shots-2026-09-11/library-after/30-check-result-panel.png`): the
 * head counted two missing links and one name without a page, the body listed neither,
 * and in the same frame the pane strip said two pages were off-template while two index
 * rows each said the page needed its sources checked and was off-template. The app had
 * already computed, per page, facts it was telling the person it could not show.
 *
 * So the page is now **two places, and the place is the provenance**:
 *
 * 1. **What the app checked** leads, because it is the half that is always true. It is
 *    derived from `model.structural` — `verdicts` regrouped by `mcp/src/wiki-report.mjs`,
 *    the same module `wiki-validate` and `validate_wiki` group with — so it needs no
 *    press, no agent and no memory, and it is identical after quitting the app because
 *    nothing about it was remembered. Blocking kinds first, advisory last.
 * 2. **What the agent read** follows with its own head: the log line, or the disabled
 *    "Check the wiki" chip and the reason it cannot run here. Only this half can be
 *    empty, and only its copy may say so.
 *
 * That split is why `report.never` / `clean` / `gone` / `emptyLede` were re-scoped rather
 * than reused. `empty` was computed from the *agent's* findings, so a person with no agent
 * would have read "Not checked yet…" directly above a live list of nine computed rows, and
 * a clean agent run would have printed "found nothing to fix" above findings that are
 * exactly things to fix (both PO seats, 2026-09-12).
 *
 * **Every row keeps one door, and only one.** A finding's page names are the door: they
 * are `library-finding-page` buttons and they open the page. Structural rows get that and
 * nothing else — the door *is* the "open" the owner's decision asks for, and a chip beside
 * a link to the same page would be two doors to one place. **Fix** and **Propose** start
 * agent turns that write, so they stay on the agent's half only.
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
 * The finding in the reader's language, or the validator's English when there is no
 * translation for that sentence yet.
 *
 * The same rule `WikiTemplateProblems` applies beside a page: `message` is written once,
 * in English, for the machines that read it — `wiki-validate`'s output, `validate_wiki`'s
 * payload, an agent's retry — and a person gets `detail`, the sentence's pieces,
 * reassembled in their own language. `t.has` rather than a table of known keys: the
 * validator owns which sentence it just found, and a key it grows before this file learns
 * about it should degrade to English rather than render a raw message path.
 */
function describeStructuralRow(
  row: WikiReportRow,
  t: ReturnType<typeof useTranslations<"library">>,
): string {
  const key = row.detail?.key;
  if (!key) return row.message;
  const path = `wiki.problem.${key}` as "wiki.problem.orphan-page";
  if (!t.has(path)) return row.message;
  return t(path, row.detail?.values ?? {});
}

/**
 * The report's sections, in reading order, as the outline rail lists them.
 *
 * Two depth-1 heads — the two ledgers — with each ledger's kinds at depth 2. The page
 * builds the rail from this, so the rail and the page cannot disagree about what is on
 * it, and the rail is what makes the agent's half reachable in one press on a young wiki
 * where the computed half is long (the measured cost of direction B).
 */
export function reportOutline(
  structural: WikiReport | null,
  findings: readonly LintFinding[],
  candidateCount: number,
  t: ReturnType<typeof useTranslations<"library">>,
): Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> {
  const out: Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> = [];
  if (structural) {
    out.push({ slug: "report-structural", text: t("report.structuralTitle"), depth: 1, occurrence: 1, duplicate: false });
    for (const group of structural.groups) {
      out.push({
        slug: `report-code-${group.code}`,
        text: `${group.code} ${group.count}`,
        depth: 2,
        occurrence: 1,
        duplicate: false,
      });
    }
  }
  out.push({ slug: "report-semantic", text: t("report.semanticTitle"), depth: 1, occurrence: 1, duplicate: false });
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

/** `wiki/<slug>.md` as the aggregator carries it, to the slug the reader opens. */
function pageSlug(path: string): string {
  return path.replace(/\.md$/, "");
}

/**
 * A finding's pages, each one a door. One component for both ledgers so a structural row
 * and a semantic row cannot come to look like different kinds of thing.
 */
function PageDoors({
  pages,
  suffix,
  onOpenPage,
}: {
  pages: readonly string[];
  /** Appended after the last page, for a line number or a provenance word. */
  suffix?: string | null;
  onOpenPage: (slug: string) => void;
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-[color:var(--color-text-quaternary)]">
      {pages.map((slug, pageIndex) => (
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
      {suffix ? (
        <span className="inline-flex items-center gap-x-1.5">
          <span aria-hidden>·</span>
          <span>{suffix}</span>
        </span>
      ) : null}
    </p>
  );
}

export function LibraryCheckReport({
  structural,
  findings,
  candidates,
  lastLint,
  busy,
  onLint,
  lintBlockedReason,
  onFix,
  onPropose,
  onOpenPage,
  fixedKeys,
  t,
}: {
  /**
   * The app's own half, already grouped. Null only where no folder is open — never
   * because nobody pressed anything.
   */
  structural: WikiReport | null;
  findings: readonly LintFinding[];
  candidates: readonly LintNodeCandidate[];
  /** The app's record of the last agent reading, or null when it never ran. */
  lastLint: { at: string; summary: string } | null;
  busy: boolean;
  /** Starts a check; null when no agent can run one here — the chip is still drawn. */
  onLint: (() => void) | null;
  /** Why it cannot run here, for the disabled chip. Null when it can. */
  lintBlockedReason?: string | null;
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
  /*
   * Only the agent's half can be empty. `lastCheckFoundSomething` reads the app's own log
   * line for a non-zero digit, because the counts persist in `wiki/_log.md` and the
   * findings do not: an empty agent half under a log line that counts findings is not
   * "nothing to fix", it is a page reopened after the app was (measured on the installed
   * app, council 2026-09-07), and it says so.
   */
  const semanticEmpty = findings.length === 0 && candidates.length === 0;
  const lastCheckFoundSomething = !!lastLint && /(?:^|\D)[1-9]\d*/.test(lastLint.summary);

  return (
    <article data-testid="library-check-report" className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-[var(--page-bottom-breath)] pt-8 md:px-10">
      <header>
        <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
          {t("report.title")}
        </h2>
      </header>

      {structural ? (
        <section data-testid="library-check-structural" className="mt-8">
          <h3
            id="report-structural"
            className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
          >
            {t("report.structuralTitle")}
          </h3>
          {/* Derived counts, not a remembered line. The head names what each number
              counts, because `wiki-validate` calls every page with any finding
              off-template while a page whose only findings are advisory fits — one folder,
              two true totals, and a frame that showed both without saying so is what the
              licensing record's falsifier describes. */}
          <p
            data-testid="library-check-structural-head"
            className="mt-1.5 max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("report.structuralHead", {
              pages: structural.pageCount,
              offTemplate: structural.blockingPageCount,
              findings: structural.findingCount,
            })}
          </p>
          {structural.unmeasured.length > 0 ? (
            /* Page bytes are read lazily, so "nothing listed" and "nothing read yet" are
               different states and the second one must never wear the first one's words. */
            <p
              data-testid="library-check-unmeasured"
              className="mt-2 max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
            >
              {t("report.unmeasured", { count: structural.unmeasured.length })}
            </p>
          ) : null}
          {structural.groups.length === 0 && structural.unmeasured.length === 0 ? (
            <p className="mt-3 max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {t("report.structuralClean")}
            </p>
          ) : null}
          {structural.groups.map((group) => (
            <section key={group.code} data-testid="library-structural-group" data-code={group.code} className="mt-6">
              {/* The heading is the code itself, in the same mono grade the per-page block
                  uses. It is the token `wiki-validate` prints and an agent branches on, so
                  a person holding this page beside a terminal is reading one vocabulary —
                  which is how they can check the record's falsifier themselves. */}
              <h4
                id={`report-code-${group.code}`}
                className="scroll-mt-4 font-mono text-caption text-[color:var(--color-text-tertiary)]"
              >
                {group.code}
                <span className="ml-2 font-sans text-label text-[color:var(--color-text-quaternary)]">
                  {group.count}
                </span>
                {group.advisory ? (
                  /* Advisory is stated, not implied by position: `orphan-page` is true of
                     every page in a wiki nobody has cross-linked yet, and a reader who
                     does not know that reads six rows as six mistakes. */
                  <span className="ml-2 font-sans text-label font-normal text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
                    {t("report.advisoryMark")}
                  </span>
                ) : null}
              </h4>
              <ul className="mt-2 flex flex-col divide-y divide-[color:var(--color-divider)]">
                {group.rows.map((row, index) => (
                  <li
                    key={`${row.page}-${row.code}-${row.line ?? index}`}
                    data-testid="library-structural-finding"
                    className="flex min-w-0 items-start gap-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
                        {describeStructuralRow(row, t)}
                      </p>
                      <PageDoors
                        pages={[pageSlug(row.page)]}
                        suffix={row.line ? `:${row.line}` : null}
                        onOpenPage={onOpenPage}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      ) : null}

      <section data-testid="library-check-semantic" className="mt-10">
        <h3
          id="report-semantic"
          className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
        >
          {t("report.semanticTitle")}
        </h3>
        <p
          data-testid="library-check-report-when"
          className="mt-1.5 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {lastLint
            ? t("wiki.logLint", { when: logWhen(lastLint.at), summary: localizeWikiLogSummary(lastLint.summary, t) })
            : t("report.never")}
        </p>

        {semanticEmpty ? (
          <div className="mt-4 flex flex-col items-start gap-3">
            {/* The lede, a finding's sentence and the candidates note are read as lines, so
                they take `--measure-prose`; the report's own column stays
                `--measure-doc-column` (2026-09-11 calibration — `app/globals.css`,
                `--measure-prose`). */}
            <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {lastLint ? (lastCheckFoundSomething ? t("report.gone") : t("report.clean")) : t("report.emptyLede")}
            </p>
          </div>
        ) : null}

        {/* Present and disabled rather than absent: a feature the product has is always on
            screen and availability is a state with its reason (`docs/DECISIONS.md`
            2026-09-11). The computed half above needs no agent, so this is the only control
            on the page that can be blocked, and the reason belongs beside it. */}
        {onLint || lintBlockedReason ? (
          <div className="mt-4 flex flex-col items-start gap-1.5">
            <Chip
              data-testid="library-check-report-lint"
              onClick={onLint ?? undefined}
              disabled={busy || onLint === null}
              tone="secondary"
              hoverInk="strong"
              aria-describedby={onLint === null && lintBlockedReason ? "library-check-report-lint-blocked" : undefined}
            >
              <Stethoscope size={ICON_SIZE.sm} aria-hidden />
              <span>{t("wiki.lint")}</span>
            </Chip>
            {onLint === null && lintBlockedReason ? (
              <p
                id="library-check-report-lint-blocked"
                data-testid="library-check-report-lint-blocked"
                className="max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
              >
                {lintBlockedReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.code} data-testid={`library-check-report-${group.code}`} className="mt-8">
            <h4
              id={`report-${group.code}`}
              className="scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            >
              {t(`wiki.findingKind.${findingKindKey(group.code)}`)}
              <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
                {group.rows.length}
              </span>
            </h4>
            <ul className="mt-2 flex flex-col divide-y divide-[color:var(--color-divider)]">
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
                    <PageDoors pages={finding.pages} onOpenPage={onOpenPage} />
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
          <section data-testid="library-candidates" className="mt-8">
            <h4
              id="report-names"
              className="scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            >
              {t("report.namesTitle")}
              <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
                {candidates.length}
              </span>
            </h4>
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
      </section>
    </article>
  );
}
