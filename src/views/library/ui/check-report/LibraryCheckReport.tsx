"use client";

import { useCallback, useMemo, useState } from "react";
import { Stethoscope } from "lucide-react";
import type { useTranslations } from "next-intl";

import type { LintFinding, LintNodeCandidate, WikiProblemContext } from "@/features/library";
import { isRunActive, useWorkRunStage, type WorkRun } from "@/features/work-run";
import type { WikiReport } from "@/shared/lib/library/wiki-report.mjs";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { Chip } from "@/shared/ui";
import { BrandMark } from "@/shared/ui/marks/brand-mark";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { AgentMissingNotice } from "../agent/AgentMissingNotice";
import type { WikiProblemDoors } from "../wiki/WikiTemplateProblems";
import { SemanticLedger } from "./SemanticLedger";
import { StructuralLedger } from "./StructuralLedger";

/**
 * Two ledgers, the computed one first: what the app checked (from `model.structural`, needing no
 * press, agent or memory), then what the agent read. A finding's page names are its one door; Fix
 * and Propose stay on the agent half.
 */
export function LibraryCheckReport({
  structural,
  findings,
  candidates,
  lastLint,
  busy,
  running,
  onLint,
  lintBlockedReason,
  agentMissing = false,
  onFix,
  onPropose,
  onOpenPage,
  onOpenSource,
  pageTitle,
  onJumpToSection,
  advisoryOpen: advisoryOpenProp,
  onAdvisoryOpenChange,
  fixedKeys,
  checkRun = null,
  folder,
  onStopCheck,
  onOpenConversation,
  conversationOpen = false,
  t,
}: {
  /** The app's own half, already grouped. Null only where no folder is open, never because nobody pressed anything. */
  structural: WikiReport | null;
  findings: readonly LintFinding[];
  candidates: readonly LintNodeCandidate[];
  /** The app's record of the last agent reading, or null when it never ran. */
  lastLint: { at: string; summary: string } | null;
  busy: boolean;
  /** A check is in flight now, unlike `busy`. Only this chip wears the wait: below 1024px the index column's mark is off screen. */
  running?: boolean;
  /** Starts a check; null when no agent can run one here, and the chip is still drawn. */
  onLint: (() => void) | null;
  /** Why it cannot run here, for the disabled chip. Null when it can. */
  lintBlockedReason?: string | null;
  /** The installed app found no coding agent: the chip gives way to `AgentMissingNotice` and its door to the agents page. */
  agentMissing?: boolean;
  onFix: ((finding: LintFinding) => void) | null;
  onPropose: ((candidate: LintNodeCandidate) => void) | null;
  onOpenPage: (slug: string) => void;
  /** Opens an original a finding names. Absent leaves that file name as plain words. */
  onOpenSource?: (path: string) => void;
  /** A wiki page's own title, by slug, so a finding names pages the way the list does. */
  pageTitle?: (slug: string) => string | undefined;
  /** Moves the pane to one of this page's own section heads; the reading pane owns the scroll container and the outline rail goes through the same function. */
  onJumpToSection?: (slug: string) => void;
  /** Whether the advisory kinds are open, when the caller owns it because the rail above this component shares it; uncontrolled stays local. */
  advisoryOpen?: boolean;
  onAdvisoryOpenChange?: (open: boolean) => void;
  /** Keys (`findingKey`) of the findings a Fix turn completed since the last check. */
  fixedKeys?: ReadonlySet<string>;
  /** This folder's wiki check, running or ended this session; the section is its stage. */
  checkRun?: WorkRun | null;
  /** The folder this page shows, so the card elsewhere stands down while this stage is drawn. */
  folder?: string;
  onStopCheck?: () => void;
  onOpenConversation?: () => void;
  /** The conversation stands beside the report, already showing the agent at work. */
  conversationOpen?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  useWorkRunStage(folder ?? "", folder !== undefined);
  const checkRunning = isRunActive(checkRun);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  // Advisory kinds start closed in every state: they are true of any wiki nobody has cross-linked, and open they push the agent half below the fold.
  const [advisoryOpenLocal, setAdvisoryOpenLocal] = useState(false);
  const advisoryOpen = advisoryOpenProp ?? advisoryOpenLocal;
  /*
   * The ledger holds one row per finding, about a thousand on a large wiki, and the page above
   * re-renders on every header press. Its doors keep one identity so the memoised ledger skips
   * those renders; they call whatever handler the latest render passed.
   */
  const latest = useLatestRef({ onOpenPage, onOpenSource, onJumpToSection, onAdvisoryOpenChange });
  const [handlers] = useState(() => ({
    openPage: (slug: string) => latest.current.onOpenPage(slug),
    openSource: (path: string) => latest.current.onOpenSource?.(path),
    jumpToSection: (slug: string) => latest.current.onJumpToSection?.(slug),
    setAdvisoryOpen: (next: boolean) => {
      const change = latest.current.onAdvisoryOpenChange;
      if (change) change(next);
      else setAdvisoryOpenLocal(next);
    },
  }));
  const opensSources = onOpenSource !== undefined;
  const toggleAdvisory = useCallback(() => handlers.setAdvisoryOpen(!advisoryOpen), [advisoryOpen, handlers]);
  // No `onOpenPlace`: this page is not the page a finding is about, so each row's own door opens it. `place: "section"` keeps the line out of the sentence, where the collapsed row's door carries every line.
  const structuralDoors = useMemo<WikiProblemDoors>(
    () => ({ onOpenPage: handlers.openPage, ...(opensSources ? { onOpenSource: handlers.openSource } : {}) }),
    [handlers, opensSources],
  );
  const structuralContext = useMemo<WikiProblemContext>(() => ({
    place: "section",
    ...(pageTitle ? { pageTitle } : {}),
  }), [pageTitle]);
  // Zero prints no number: a bare 0 beside a head reads as "nothing here" for a half that still holds the one ability this screen can be blocked on.
  const semanticCount = findings.length + candidates.length;

  return (
    <article data-testid="library-check-report" className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-[var(--page-bottom-breath)] pt-8 md:px-10">
      <header>
        <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
          {t("report.title")}
        </h2>
        {/* With no coding agent at all the notice and its door replace a dead chip; while one is still being looked
           for, or a local model can only write pages, the chip stays beside its reason. */}
        {checkRunning ? null : onLint === null && agentMissing ? (
          <AgentMissingNotice
            testId="library-check-report-agent-missing"
            doorTestId="library-check-report-agent-missing-door"
            className="mt-3 w-fit max-w-full"
            t={t}
          />
        ) : onLint || lintBlockedReason ? (
          <div className="mt-3 flex flex-col items-start gap-1.5">
            <Chip
              data-testid="library-check-report-lint"
              onClick={onLint ?? undefined}
              disabled={busy || onLint === null}
              tone="secondary"
              hoverInk="strong"
              data-report-state={running ? "running" : undefined}
              aria-describedby={onLint === null && lintBlockedReason ? "library-check-report-lint-blocked" : undefined}
            >
              {running ? (
                // The wait replaces the icon in its own 14px slot so the label does not move; the word is said once, live, for a screen reader.
                <span
                  data-testid="library-check-report-running"
                  className="relative inline-flex size-3.5 shrink-0"
                >
                  <BrandMark
                    detail="micro"
                    alt=""
                    aria-hidden
                    className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2"
                  />
                  <span aria-live="polite" className="sr-only">
                    {t("report.running")}
                  </span>
                </span>
              ) : (
                <Stethoscope size={ICON_SIZE.sm} aria-hidden />
              )}
              <span>{t("wiki.lint")}</span>
            </Chip>
            {onLint === null && lintBlockedReason ? (
              <p
                id="library-check-report-lint-blocked"
                data-testid="library-check-report-lint-blocked"
                className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
              >
                {lintBlockedReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {structural ? (
        <StructuralLedger
          structural={structural}
          doors={structuralDoors}
          context={structuralContext}
          onOpenPage={handlers.openPage}
          onJumpToSection={onJumpToSection ? handlers.jumpToSection : undefined}
          semanticCount={semanticCount}
          advisoryOpen={advisoryOpen}
          onToggleAdvisory={toggleAdvisory}
          t={t}
        />
      ) : null}

      <SemanticLedger
        findings={findings}
        candidates={candidates}
        lastLint={lastLint}
        checkRun={checkRun}
        checkRunning={checkRunning}
        fixedKeys={fixedKeys}
        busy={busy}
        conversationOpen={conversationOpen}
        candidatesOpen={candidatesOpen}
        onToggleCandidates={() => setCandidatesOpen((open) => !open)}
        onFix={onFix}
        onPropose={onPropose}
        onOpenPage={onOpenPage}
        onStopCheck={onStopCheck}
        onOpenConversation={onOpenConversation}
        t={t}
      />
    </article>
  );
}
