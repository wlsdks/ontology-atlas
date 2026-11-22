"use client";

import type { useTranslations } from "next-intl";

import type { WikiProblemContext } from "@/features/library";
import type { WikiReport } from "@/shared/lib/library/wiki-report.mjs";
import { Chip } from "@/shared/ui";

import type { WikiProblemDoors } from "../wiki/WikiTemplateProblems";
import { StructuralGroup } from "./StructuralGroup";

/** The report's first half: what the app itself checked, needing no press, agent or memory. */
export function StructuralLedger({
  structural,
  doors,
  context,
  onOpenPage,
  onJumpToSection,
  semanticCount,
  advisoryOpen,
  onToggleAdvisory,
  t,
}: {
  structural: WikiReport;
  doors: WikiProblemDoors;
  context: WikiProblemContext;
  onOpenPage: (slug: string) => void;
  onJumpToSection?: (slug: string) => void;
  /** The agent half's total, so the jump says how much is down there; zero prints no number. */
  semanticCount: number;
  advisoryOpen: boolean;
  onToggleAdvisory: () => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const blockingGroups = structural.groups.filter((group) => !group.advisory);
  const advisoryGroups = structural.groups.filter((group) => group.advisory);
  const advisoryCount = advisoryGroups.reduce((total, group) => total + group.count, 0);
  return (
    <section data-testid="library-check-structural" className="mt-8">
      <h3
        id="report-structural"
        className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
      >
        {t("report.structuralTitle")}
      </h3>
      {/* Derived counts, not a remembered line. The head names what each number counts: a page with any finding is
          off-template while a page whose only findings are advisory fits, so one folder has two true totals. */}
      <p
        data-testid="library-check-structural-head"
        className="mt-1.5 text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
      >
        {t("report.structuralHead", {
          pages: structural.pageCount,
          offTemplate: structural.blockingPageCount,
          findings: structural.findingCount,
        })}
      </p>
      {structural.unmeasured.length > 0 ? (
        // Page bytes are read lazily, so "nothing listed" and "nothing read yet" are different states.
        <p
          data-testid="library-check-unmeasured"
          className="mt-2 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("report.unmeasured", { count: structural.unmeasured.length })}
        </p>
      ) : null}
      {/* The outline rail needs a pane of 1045px; below that this page carries its own two-item jump, shown on the
          attribute `DocReadingPane` emits for exactly this question (`data-outline-fit`). The chips carry no
          `atlas-touch-floor`: `shape: "chip"` emits it from the value layer. */}
      {onJumpToSection ? (
        <nav
          data-testid="library-report-jump"
          aria-label={t("report.jumpAria")}
          className='mt-2.5 hidden flex-wrap items-center gap-1.5 [[data-outline-fit="hidden"]_&]:flex'
        >
          <Chip
            data-testid="library-report-jump-structural"
            tone="muted"
            hoverInk="strong"
            onClick={() => onJumpToSection("report-structural")}
          >
            {t("report.structuralTitle")}
          </Chip>
          <Chip
            data-testid="library-report-jump-semantic"
            tone="muted"
            hoverInk="strong"
            onClick={() => onJumpToSection("report-semantic")}
          >
            {t("report.semanticTitle")}
            {semanticCount > 0 ? (
              <span className="text-label text-[color:var(--color-text-quaternary)]">{semanticCount}</span>
            ) : null}
          </Chip>
        </nav>
      ) : null}
      {structural.groups.length === 0 && structural.unmeasured.length === 0 ? (
        <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {t("report.structuralClean")}
        </p>
      ) : null}
      {blockingGroups.map((group) => (
        <StructuralGroup key={group.code} group={group} onOpenPage={onOpenPage} doors={doors} context={context} t={t} />
      ))}
      {advisoryGroups.length > 0 ? (
        <>
          {/* One closed control for the kinds the app itself calls expected of a young wiki. While it is closed the
              rail's advisory anchors land here, so `#report-code-orphan-page` still resolves to something on screen. */}
          <div className="mt-5 border-t border-[color:var(--color-divider)] pt-4">
            <Chip
              data-testid="library-advisory-fold"
              tone="muted"
              hoverInk="strong"
              onClick={onToggleAdvisory}
              aria-expanded={advisoryOpen}
            >
              {advisoryOpen ? (
                t("report.advisoryLess")
              ) : (
                <>
                  <span>{t("report.advisoryFold", { count: advisoryCount })}</span>
                  <span aria-hidden>·</span>
                  <span className="text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                    {t("report.advisoryMark")}
                  </span>
                </>
              )}
            </Chip>
            {!advisoryOpen
              ? advisoryGroups.map((group) => (
                  <span key={group.code} aria-hidden className="block scroll-mt-4" id={`report-code-${group.code}`} />
                ))
              : null}
          </div>
          {advisoryOpen
            ? advisoryGroups.map((group) => (
                <StructuralGroup key={group.code} group={group} onOpenPage={onOpenPage} doors={doors} context={context} t={t} />
              ))
            : null}
        </>
      ) : null}
    </section>
  );
}
