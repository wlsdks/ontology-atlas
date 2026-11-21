"use client";

import type { useTranslations } from "next-intl";
import { memo } from "react";

import { Button, Tooltip } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

import {
  groupWikiProblems,
  wikiProblemMachineLine,
  type WikiProblemContext,
  type WikiProblemTarget,
  type WikiProblemWhere,
  type WikiProblemWords,
  type WikiTemplateProblem,
  isWikiFolderCode,
} from "@/features/library";

import { CheckCodesButton } from "./CheckCodesDialog";

export type { WikiTemplateProblem };

/**
 * Why a page does not fit the wiki template, in the reader's own words: one sentence per finding plus
 * what to do, every name a press. `describeWikiProblem` owns both halves; the validator's codes open
 * in a centred dialog from the card's title line. Page findings and folder findings sit on separate
 * cards; a folder finding is one line naming both pages.
 */

/** What this surface can open. A handler left out renders that name as plain text. */
export interface WikiProblemDoors {
  /** Opens another wiki page by slug (`wiki/payments-01`). */
  onOpenPage?: (slug: string) => void;
  /** Opens an original by folder-relative path (`sources/payments-ledger-01.html`). */
  onOpenSource?: (path: string) => void;
  /** Puts the reader at the place the finding names, when the surface can travel there. */
  onOpenPlace?: (where: WikiProblemWhere) => void;
}

/**
 * The card's way out: `agent` asks the coding agent to fix the page, `self` reveals the file.
 * `null` on the web. The folder card has none: its findings are fixed by editing another page.
 */
export interface WikiProblemFix {
  mode: "agent" | "self";
  onPress: () => void;
  disabled?: boolean;
  /**
   * Whether every write from this turn stops at a permission card. A prop because the default `auto`
   * mode answers the permission itself for a page `validateWikiPage` accepts.
   */
  askEveryWrite?: boolean;
}

type Translate = ReturnType<typeof useTranslations<"library">>;

/**
 * A name inside a sentence: `link` at `size: "lg"` so it sits on the prose's `text-body` step.
 * `inline` takes the prose line box; `px-0.5 -mx-0.5` keeps the 2px focus ring off the glyphs at no
 * cost in advance. The underline marks it as pressable rather than linter output.
 */
const INLINE_WORD = {
  shape: "link",
  size: "lg",
  tone: "accent",
  hoverInk: "strong",
  className:
    "inline align-baseline whitespace-normal break-keep -mx-0.5 px-0.5 underline decoration-[color:var(--color-indigo-line-a40)] underline-offset-2 hover:decoration-[color:var(--color-indigo-accent)]",
} as const;

/**
 * A name in the sentence, pressable when this surface can open the thing it names.
 *
 * `INLINE_WORD` above owns the appearance; what is decided here is *whether* there is a
 * press at all. A page nobody wrote and an original that is not in the folder are named
 * but never pressable — a link to nothing teaches a person that links here go nowhere.
 */
function TargetWord({
  target,
  doors,
  t,
}: {
  target: WikiProblemTarget;
  doors: WikiProblemDoors | undefined;
  t: Translate;
}) {
  const open = target.kind === "page" ? doors?.onOpenPage : doors?.onOpenSource;
  if (!open) return <>{target.name}</>;
  return (
    <button
      type="button"
      data-testid="library-wiki-problem-target"
      data-target-kind={target.kind}
      data-target-id={target.id}
      title={t(target.kind === "page" ? "wiki.openPage" : "wiki.openSource", { name: target.name })}
      onClick={() => open(target.id)}
      className={controlClass(INLINE_WORD)}
    >
      {target.name}
    </button>
  );
}

/** One place, pressable when this surface can travel to it. */
function OnePlace({
  where,
  doors,
  t,
}: {
  where: WikiProblemWhere;
  doors: WikiProblemDoors | undefined;
  t: Translate;
}) {
  // A line alone is not a destination on a rendered page: the reader draws paragraphs,
  // not lines. A finding whose code fixes a section has one, and that is the press.
  const open = where.section && doors?.onOpenPlace ? doors.onOpenPlace : null;
  if (!open) return <>{where.label}</>;
  return (
    <button
      type="button"
      data-testid="library-wiki-problem-place"
      title={t("wiki.goToPlace", { place: where.label })}
      onClick={() => open(where)}
      className={controlClass(INLINE_WORD)}
    >
      {where.label}
    </button>
  );
}

/**
 * Every place one row stands for. One row can be two bullets with one sentence between
 * them, and then the sentence carries both presses rather than being printed twice.
 */
function PlaceWords({
  places,
  doors,
  t,
}: {
  places: readonly WikiProblemWhere[];
  doors: WikiProblemDoors | undefined;
  t: Translate;
}) {
  return (
    <>
      {places.map((where, index) => (
        <span key={`${where.label}-${index}`}>
          {index > 0 ? ", " : ""}
          {/* After the first, a place in the same section drops the section from its own
              words: "line 19 under Facts, line 20 under Facts" says one section twice. */}
          <OnePlace
            where={
              index > 0 && where.lineLabel && where.section === places[0]!.section
                ? { ...where, label: where.lineLabel }
                : where
            }
            doors={doors}
            t={t}
          />
        </span>
      ))}
    </>
  );
}

/**
 * One finding's sentence, with each name and the place pressable in place.
 *
 * Exported because the computed check report shows the **same** finding: a person who
 * reads it there and then opens the page must meet one sentence, not two retellings of
 * one folder.
 */
export function WikiProblemSentence({
  words,
  places,
  doors,
  t,
}: {
  words: WikiProblemWords;
  /** Overrides the sentence's own place with every place its row stands for. */
  places?: readonly WikiProblemWhere[];
  doors?: WikiProblemDoors;
  t: Translate;
}) {
  return (
    <>
      {words.segments.map((segment, index) => {
        if (segment.kind === "text") return <span key={index}>{segment.text}</span>;
        if (segment.kind === "where") {
          return (
            <PlaceWords
              key={index}
              places={places && places.length > 0 ? places : [segment.where]}
              doors={doors}
              t={t}
            />
          );
        }
        return <TargetWord key={index} target={segment.target} doors={doors} t={t} />;
      })}
    </>
  );
}

/** The one control, or nothing — never a control that cannot act. */
function FixAction({ fix, t }: { fix: WikiProblemFix | null | undefined; t: Translate }) {
  if (!fix) return null;
  const agent = fix.mode === "agent";
  return (
    <Tooltip
      content={t(
        agent
          ? fix.askEveryWrite
            ? "wiki.fixWithAgentTooltipAsk"
            : "wiki.fixWithAgentTooltip"
          : "wiki.fixMyselfTooltip",
      )}
    >
      <Button
        size="sm"
        variant="outline"
        data-testid="library-wiki-fix"
        data-fix-mode={fix.mode}
        disabled={fix.disabled}
        onClick={fix.onPress}
        className="atlas-touch-floor max-w-full shrink-0"
      >
        {t(agent ? "wiki.fixWithAgent" : "wiki.fixMyself")}
      </Button>
    </Tooltip>
  );
}

/** One heading line, one list, one way out — used twice with different subjects. */
function ProblemGroup({
  problems,
  ariaLabel,
  title,
  testId,
  file,
  doors,
  fix,
  context,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  ariaLabel: string;
  title: string;
  testId: string;
  /** `wiki/<slug>.md`, the page's own address, for the check codes dialog. */
  file?: string;
  doors?: WikiProblemDoors;
  fix?: WikiProblemFix | null;
  context?: WikiProblemContext;
  t: Translate;
}) {
  if (problems.length === 0) return null;
  return (
    <section
      aria-label={ariaLabel}
      data-testid={testId}
      className="mx-auto mt-4 max-w-[var(--measure-doc-column)] px-6 md:px-10"
    >
      <div className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-4 py-3">
        {/* The count and the kind on the left, the codes and the one way out on the right — the
            card's whole ability on one line, which is where a person looks for it. */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <CheckCodesButton
              lines={problems.map(wikiProblemMachineLine)}
              file={file}
              testId={`${testId}-technical`}
              fileTestId={`${testId}-file`}
              codeTestId="library-wiki-problem-code"
              t={t}
            />
            <FixAction fix={fix} t={t} />
          </div>
        </div>
        {/* `[word-break:keep-all]` stops a Korean word breaking across the wrap. */}
        <ul className="mt-2.5 flex flex-col gap-2.5 font-sans">
          {groupWikiProblems(problems, t, context).map(({ words, places }, index) => (
            <li
              key={`${words.code}-${index}`}
              data-testid="library-wiki-problem"
              className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
            >
              {/* A finding retold in one line carries its action after a middle dot; the others keep two lines. */}
              {words.short ? (
                <p>
                  <WikiProblemSentence words={words} places={places} doors={doors} t={t} />
                  {words.action ? (
                    <span className="text-[color:var(--color-text-tertiary)]"> · {words.action}</span>
                  ) : null}
                </p>
              ) : (
                <>
                  <p>
                    <WikiProblemSentence words={words} places={places} doors={doors} t={t} />
                  </p>
                  {words.action ? (
                    <p className="text-[color:var(--color-text-tertiary)]">{words.action}</p>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/*
 * Memoised: the reader's scroll position and outline highlight re-render the Library on every
 * change, and a long page's list of places must not be drawn again for them.
 */
export const WikiTemplateProblems = memo(function WikiTemplateProblems({
  problems,
  file,
  doors,
  fix,
  context,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  /** `wiki/<slug>.md`, the page's own address: printed in the check codes dialog, and `{page}` in a folder line. */
  file?: string;
  doors?: WikiProblemDoors;
  /** The own-shape card's action. The folder card has none — see `WikiProblemFix`. */
  fix?: WikiProblemFix | null;
  context?: WikiProblemContext;
  t: Translate;
}) {
  if (problems.length === 0) return null;
  const ownShape = problems.filter((problem) => !isWikiFolderCode(problem.code));
  const folder = problems.filter((problem) => isWikiFolderCode(problem.code));
  return (
    <>
      <ProblemGroup
        problems={ownShape}
        ariaLabel={t("wiki.offTemplateAriaLabel")}
        title={t("wiki.offTemplateTitle", { count: ownShape.length })}
        testId="library-wiki-problems"
        file={file}
        doors={doors}
        fix={fix}
        context={context}
        t={t}
      />
      <ProblemGroup
        problems={folder}
        ariaLabel={t("wiki.linkFindingsAriaLabel")}
        title={t("wiki.linkFindingsTitle", { count: folder.length })}
        testId="library-wiki-link-findings"
        file={file}
        doors={doors}
        context={file ? { ...context, page: file.replace(/\.md$/, "") } : context}
        t={t}
      />
    </>
  );
});
