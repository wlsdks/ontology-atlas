import type { useTranslations } from "use-intl";

import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";
import type { WorkRun } from "@/features/work-run";
import { Button } from "@/shared/ui/controls/button";
import { Chip, Tooltip } from "@/shared/ui";

import { findingKey, findingKindKey } from "../../model/check-report/check-report-outline";
import { foldCandidates, groupFindings, lastCheckFoundSomething, logWhen, orderCandidates } from "../../model/check-report/semantic-ledger";
import { localizeWikiLogSummary } from "../../lib/wiki/wiki-log-summary";
import { PageDoors } from "./PageDoors";
import { WikiCheckStage } from "./WikiCheckStage";

/** The report's second half: what the agent read, its running or ended check, its findings and the names it proposes. */
export function SemanticLedger({
  findings,
  candidates,
  lastLint,
  checkRun,
  checkRunning,
  fixedKeys,
  busy,
  conversationOpen,
  candidatesOpen,
  onToggleCandidates,
  onFix,
  onPropose,
  onOpenPage,
  onStopCheck,
  onOpenConversation,
  t,
}: {
  findings: readonly LintFinding[];
  candidates: readonly LintNodeCandidate[];
  /** The app's record of the last agent reading, or null when it never ran. */
  lastLint: { at: string; summary: string } | null;
  checkRun: WorkRun | null;
  checkRunning: boolean;
  /** Keys (`findingKey`) of the findings a Fix turn completed since the last check. */
  fixedKeys?: ReadonlySet<string>;
  busy: boolean;
  conversationOpen: boolean;
  candidatesOpen: boolean;
  onToggleCandidates: () => void;
  onFix: ((finding: LintFinding) => void) | null;
  onPropose: ((candidate: LintNodeCandidate) => void) | null;
  onOpenPage: (slug: string) => void;
  onStopCheck?: () => void;
  onOpenConversation?: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const { shown: shownCandidates, folded: foldedCandidates } = foldCandidates(orderCandidates(candidates), candidatesOpen);
  const groups = groupFindings(findings);
  const semanticEmpty = findings.length === 0 && candidates.length === 0;
  return (
    <section data-testid="library-check-semantic" className="mt-10">
      <h3
        id="report-semantic"
        className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
      >
        {t("report.semanticTitle")}
      </h3>
      {checkRunning && !lastLint ? null : (
        <p
          data-testid="library-check-report-when"
          className="mt-1.5 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {lastLint
            ? t("wiki.logLint", { when: logWhen(lastLint.at), summary: localizeWikiLogSummary(lastLint.summary, t) })
            : t("report.never")}
        </p>
      )}

      {checkRun && checkRunning ? (
        <WikiCheckStage run={checkRun} besideConversation={conversationOpen} onStop={() => onStopCheck?.()} onReview={() => onOpenConversation?.()} />
      ) : checkRun?.phase === "unreadable" || checkRun?.phase === "failed" ? (
        <div data-testid="library-check-ended" data-phase={checkRun.phase} className="mt-4 flex flex-col items-start gap-1.5">
          <p className="text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]">
            {checkRun.phase === "unreadable" ? t("check.unreadTitle") : t("check.failedTitle")}
          </p>
          <p className="text-body leading-body text-[color:var(--color-text-secondary)]">
            {checkRun.phase === "unreadable" ? t("check.unreadBody") : t("check.failedBody", { agent: checkRun.agent })}
          </p>
          {onOpenConversation ? (
            <Button size="sm" variant="outline" className="mt-1.5" onClick={onOpenConversation} data-testid="library-check-open-conversation">
              {t("check.openConversation")}
            </Button>
          ) : null}
        </div>
      ) : semanticEmpty ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          {/* The report's column sets the measure (`--measure-doc-column`): a `ch` cap resolves shorter and gives a second right edge. */}
          <p data-testid="library-check-lede" className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            {checkRun?.phase === "stopped"
              ? t("check.stopped")
              : checkRun?.phase === "clean"
                ? t("report.clean")
                : lastLint ? (lastCheckFoundSomething(lastLint) ? t("report.gone") : t("report.clean")) : t("report.emptyLede")}
          </p>
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
                  <p className="text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
                    {finding.summary}
                  </p>
                  <PageDoors pages={finding.pages} onOpenPage={onOpenPage} />
                </div>
                {fixedKeys?.has(findingKey(finding)) ? (
                  // A Fix turn ended on this finding; the row says so until the next check re-judges the pages.
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
          <p className="mt-1 text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
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
              onClick={onToggleCandidates}
              aria-expanded={candidatesOpen}
            >
              {candidatesOpen ? t("wiki.candidatesLess") : t("wiki.candidatesMore", { count: foldedCandidates })}
            </Chip>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
