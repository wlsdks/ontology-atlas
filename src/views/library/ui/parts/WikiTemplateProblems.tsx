"use client";

import type { useTranslations } from "next-intl";

import { Button, Disclosure, Tooltip } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

import {
  groupWikiProblems,
  wikiProblemMachineLine,
  type WikiProblemContext,
  type WikiProblemTarget,
  type WikiProblemWhere,
  type WikiProblemWords,
  type WikiTemplateProblem,
} from "../../lib/describe-wiki-problem";
import { isWikiFolderCode } from "../../lib/merge-wiki-verdict";

export type { WikiTemplateProblem };

/**
 * **Why a page does not fit the wiki template, said where the page is — in the reader's
 * own words.**
 *
 * The list beside this reader carries one fixed word — *off-template* — because a badge
 * that changes shape row by row asks a reader to learn a vocabulary just to scan. The
 * sentence that says what to change belongs here, next to the text a person would
 * change.
 *
 * ⚠️ **This block was drafted inside `DocFrontmatterBlock` and moved out on 2026-09-06.**
 * That component's whole subject is *"this document tried to be a node and failed"*, and
 * a wiki page carries no `kind:` **by contract** — that absence is what keeps it out of
 * the graph. Teaching the Docs diagnosis to make an exception for a file Docs no longer
 * lists would have been two verdicts in one component with a flag between them. The
 * question actually open for a wiki page is a different question, so it is a different
 * block, and it lives in the destination that owns the file.
 *
 * ## Two findings, two headings (2026-09-09)
 *
 * ⚠️ **One heading used to cover both, and it named the wrong one.** Every finding was
 * printed under *This page does not fit the wiki template* — including the folder half,
 * which says nothing about the page's shape. Measured on a folder whose four pages all
 * fit the template: the status strip correctly showed **no** off-template clause, and
 * this panel simultaneously told the reader the page was off-template. Same screen, same
 * page, two answers, and the one in larger type was the wrong one.
 *
 * The split is the same one `merge-wiki-verdict` already draws for the row's marks and
 * the header's clauses, read from the same predicate. A page's own shape is fixed by
 * editing that page; a folder finding is fixed by editing the folder around it, and a
 * person who has just been told their page is malformed will go looking inside it.
 *
 * ## ⚠️ The card used to be written for the machine that found the finding (2026-09-12)
 *
 * The owner opened a page their agent had just written and read this:
 *
 * > *"I cannot tell what this is saying from a person's side — it just looks like alien
 * > script. This needs fixing right now."*
 *
 * What stood above the Summary was `uncited-fact:31`, a citation grammar in backticks,
 * and the names of a CLI command and an MCP tool — every one of them true, none of them
 * addressed to the person reading. Three decisions follow from that, and each is visible
 * in the markup below:
 *
 * 1. **Each finding is one sentence plus what to do**, with every name a title and every
 *    title a press. `describeWikiProblem` owns both halves for every surface.
 * 2. **One action per card**, top right: the agent fixes it, or the person does. A card
 *    that names a problem and offers no way out is a card that teaches people to stop
 *    reading cards (`docs/DECISIONS.md` 2026-09-11).
 * 3. **The machine's vocabulary goes behind one disclosure.** The codes, the line
 *    anchors, the validator's own English sentence and the CLI/tool note are still here
 *    in full, one press away, for the agents and terminal users who branch on them.
 *
 * ## The sentence is rebuilt here, not shipped from the validator
 *
 * `problem.message` is written once, in English, for the machines that read it. A person
 * gets `problem.detail` — the sentence's pieces — reassembled in their own language.
 * Before this, a Korean reader was handed `dangling-wikilink:15` followed by an English
 * paragraph. `detail` is optional on purpose: a finding that has not been given a
 * localised retelling yet still says something true rather than nothing at all.
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
 * **The card's one way out — and only the card about this page's own bytes has one.**
 *
 * `agent` sends the page and its shape findings to the connected coding agent; `self` puts
 * the person in front of the file. Null is the honest third state: on the web there is no
 * absolute path to reveal and no local agent to ask, so no dead control is printed.
 *
 * ⚠️ **The folder card deliberately has none** (po-evidence, 2026-09-12). Its findings are
 * about where this page *sits* — nothing links here; another write-up of the same original
 * does not know about this one — and both are repaired by editing **another** page. An
 * action here would have started a turn whose own brief forbids touching any other file,
 * and the self action would have opened the wrong file. What the folder card offers
 * instead is each finding's own door: the other page's title is the press, because that is
 * where the link has to be written.
 */
export interface WikiProblemFix {
  mode: "agent" | "self";
  onPress: () => void;
  disabled?: boolean;
  /**
   * Whether **every** write from this turn stops at a permission card.
   *
   * ⚠️ It is a prop rather than a fixed sentence because the answer is the person's own
   * setting, and the first draft of this tooltip said the wrong thing in the shipped
   * default: `DEFAULT_WIKI_WRITE_MODE` is `auto`, and `autoDecide` answers the permission
   * itself for a page `validateWikiPage` accepts — which is exactly the success case of
   * this repair (po-evidence and po-steward, 2026-09-12). A control may not promise a
   * checkpoint the default removes, and it may not deny one the person switched on.
   */
  askEveryWrite?: boolean;
}

type Translate = ReturnType<typeof useTranslations<"library">>;

/**
 * **A name inside a sentence: the value layer's `link`, set to the prose's own step.**
 *
 * `size: "lg"` is what puts it at `text-body`, the step the sentence around it is set in —
 * measured 2026-09-12, the default `sm` rendered the only pressable word on the card at
 * 11px inside a 12.5px line and grew the line box from 20px to 24px. `inline` follows
 * `AnswerRevisionComparison`'s citation exactly: `min-height` does not apply to a
 * non-replaced inline box, so the word takes the prose's line box instead of standing out
 * of it as one unbreakable rect (the 320px measurement behind the `.prose-link`
 * contract). `px-0.5 -mx-0.5` rather than `lg`'s `px-3`: the focus ring is 2px inset, so
 * with no inset at all it lands on the first and last glyph (the correction `PageDoors`
 * carries) — but a word inside a sentence cannot spend 12px on each side, and the padding
 * must cost the sentence **no advance at all** or a finding beginning with a name starts
 * 2px right of the finding above it. Measured 2026-09-12: it did, and the parentheses
 * around a file name had a visible gap inside each bracket.
 *
 * The underline is `PageDoors`' own — indigo at 40% with a 2px offset, brightening on
 * hover. It is here because of the walkthrough, not for decoration: given indigo ink
 * alone, one of three walkers read the place as linter output rather than as something
 * to press ("referencing raw line numbers is how a linter points at something").
 *
 * It stays a `controlClass` call so the control census keeps counting this as the
 * system's shape rather than a hand-written one.
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

/** One heading, one explanation, one list, one way out — used twice with different subjects. */
function ProblemGroup({
  problems,
  ariaLabel,
  title,
  body,
  testId,
  file,
  collapsed,
  doors,
  fix,
  context,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  ariaLabel: string;
  title: string;
  body: string;
  testId: string;
  /** `wiki/<slug>.md`, the page's own address, for the technical disclosure. */
  file?: string;
  /**
   * **Whether this card is one line a reader opens, or the open card itself.**
   *
   * On a wiki page the findings are the reason a person is looking at the page, so the card
   * is open above the body. On a **saved answer** the answer is what they opened: measured
   * in the installed app at 1512, this card ran nine lines between the byline and the
   * answer's own Summary and pushed it to 84% of the viewport
   * (`.claude/shots-2026-09-12/library-inspection/06-answer-page.png`). There it becomes one
   * summary line with its count, after the content — nothing deleted, one press away.
   */
  collapsed?: boolean;
  doors?: WikiProblemDoors;
  fix?: WikiProblemFix | null;
  context?: WikiProblemContext;
  t: Translate;
}) {
  if (problems.length === 0) return null;
  const Body = (
    <>
      {/* The explanation and every finding are sentences at one step and one left edge
          (`text-body`, owner 2026-09-12). They were `text-label` (11px) under a
          `text-body` heading — the smallest type on the card carrying the only thing a
          person had to act on. `--measure-prose` caps the line and `[word-break:keep-all]`
          arrives with the cap: the first narrower render in the installed app broke a
          Korean word across the wrap, stranding its final syllable and its particle. */}
      <p className="mt-1 max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {body}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5 font-sans">
        {groupWikiProblems(problems, t, context).map(({ words, places }, index) => (
          <li
            key={`${words.code}-${index}`}
            data-testid="library-wiki-problem"
            className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
          >
            <p>
              <WikiProblemSentence words={words} places={places} doors={doors} t={t} />
            </p>
            {words.action ? (
              <p className="text-[color:var(--color-text-tertiary)]">{words.action}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {/* The machine's own vocabulary, whole, one press away. It is not localised on
          purpose: a person opening this is holding the screen beside a terminal or an
          agent transcript, and a translated synonym is a word they would have to map
          back (the reason the check report's group headings keep the code too — both
          design seats, council 2026-09-12). */}
      <Disclosure className="mt-3" summary={t("wiki.technical")} summaryTestId={`${testId}-technical`}>
        <p className="mt-2 max-w-[var(--measure-prose)] text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
          {t("wiki.technicalNote")}
        </p>
        {/* ⚠️ **The page's own address, because the sentence above no longer carries it**
            (po-steward, 2026-09-12). For `uncited-fact`, `missing-field`, `section-order-*`,
            `kind-present` and `describes-needs-approval` the validator's message never names
            the path either, so without this line nothing on the card said which file on disk
            holds the claim — and on the web there is no Finder reveal to answer it by
            action. With it the block is byte-comparable with a `wiki-validate` page group,
            which is what the note above it promises. */}
        {file ? (
          <p
            data-testid={`${testId}-file`}
            className="mt-1.5 font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            {t("wiki.technicalFile", { path: file })}
          </p>
        ) : null}
        <ul className="mt-1.5 flex flex-col gap-1">
          {problems.map((problem, index) => (
            <li
              key={`${problem.code}-${index}`}
              data-testid="library-wiki-problem-code"
              className="font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
            >
              {wikiProblemMachineLine(problem)}
            </li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
  return (
    <section
      aria-label={ariaLabel}
      data-testid={testId}
      className="mx-auto mt-4 max-w-[var(--measure-doc-column)] px-6 md:px-10"
    >
      <div className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-4 py-3">
        {collapsed ? (
          <details>
            <summary
              data-testid={`${testId}-summary`}
              className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] marker:text-[color:var(--color-text-quaternary)]"
            >
              {title}
            </summary>
            {Body}
          </details>
        ) : (
          <>
            {/* The count and the kind on the left, the one way out on the right — the
                card's whole ability on one line, which is where a person looks for it. */}
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
                {title}
              </p>
              <FixAction fix={fix} t={t} />
            </div>
            {Body}
          </>
        )}
      </div>
    </section>
  );
}

export function WikiTemplateProblems({
  problems,
  file,
  collapsed,
  doors,
  fix,
  context,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  /** `wiki/<slug>.md`, the page's own address — printed in the technical disclosure. */
  file?: string;
  /** One summary line per group instead of the open card — see `ProblemGroup`. */
  collapsed?: boolean;
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
        body={t("wiki.offTemplateBody")}
        testId="library-wiki-problems"
        file={file}
        collapsed={collapsed}
        doors={doors}
        fix={fix}
        context={context}
        t={t}
      />
      <ProblemGroup
        problems={folder}
        ariaLabel={t("wiki.linkFindingsAriaLabel")}
        title={t("wiki.linkFindingsTitle", { count: folder.length })}
        body={t("wiki.linkFindingsBody")}
        testId="library-wiki-link-findings"
        file={file}
        collapsed={collapsed}
        doors={doors}
        context={context}
        t={t}
      />
    </>
  );
}
