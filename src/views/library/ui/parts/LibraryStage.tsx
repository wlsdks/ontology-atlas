"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { BookText, FilePlus2, Search, Sparkles, Stethoscope } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { countSourceFormats, newestWikiPage } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  libraryCompileBlockedReason,
  libraryTransferSentence,
  type CompileAvailability,
} from "../../lib/compile-availability";

import type { CompileBrain } from "../../lib/compile-brain";
import {
  libraryCoverageCaption,
  libraryStepStates,
  libraryWaitingLine,
  type LibraryStepState,
} from "../../lib/stage-steps";
import type { LibraryUiModel } from "../../lib/use-library-model";
import type { LibraryLocalModel } from "../../lib/use-library-agent";
import { CompileBrainSelect } from "./CompileBrainSelect";

/**
 * **What to do next — three rows, not three essays.**
 *
 * ## What the owner read (2026-09-06, installed app, a folder with no sources)
 *
 * > *"Why does this design look like this? It looks broken. The sizes inside the right
 * > panel are no good … and it overlaps this text. Completely wrong. Would you redo just
 * > the design?"*
 *
 * Three measurements from that frame, and each one is a rule below:
 *
 * | Measured | Rule now |
 * |---|---|
 * | the panel was 560px of a 1168px pane and its lower half lay over the graph's own *"Nothing to draw yet…"* sentence | the surface is ~360px, it stands clear of the caption and the legend, and an empty folder never raises it at all |
 * | the Gather card carried ~130px of empty space between its numbers and its buttons | there is no stretch: every row is head, one caption line, one action row, so the heights match because the **anatomy** does, not because a grid pulled them. Two rows carry an `extra` block below that action row and are allowed to differ — step two's own state, and, since 2026-09-11, step three's saved questions |
 * | every card held a paragraph, a four-row label/value table, buttons and a footnote | one caption line per row. The four-row tables are gone: those counts are already in the index beside the files they describe and in the header caption |
 *
 * ## Why the rows still exist at all
 *
 * The step words and their `done / next / waiting` states are not decoration — they are
 * the only place this screen says the work has an **order**, and `libraryStepStates` is
 * the one function that decides them (the graph's header strip reads it too). What the
 * redesign removes is the second telling: the paragraph that restates the title and the
 * table that restates the index.
 *
 * ## Where the disclosure lives
 *
 * `.claude/rules/local-first.md` allows exactly one place to say what leaves this
 * computer, and it must be where the press happens. So the transfer sentence, the blocked
 * reason and the local runner's card are all **inside step two**, under the Compile
 * button — the one row whose height is allowed to differ, because what it carries is a
 * state of the folder rather than a longer paragraph.
 */

export interface LibraryStageProps {
  model: LibraryUiModel;
  route: CompileAvailability["route"];
  /** The verified coding agent's label, when one is what will run. */
  agentLabel: string | null;
  /** The connect-by-address runner, when one is configured on this computer. */
  localModel: LibraryLocalModel | null;
  /** The turn that runner runs, and the card it ends at, seated under the Compile press. */
  /**
   * The brain that will run, and whether the person gets to change it.
   *
   * `choosable` is true only when this computer offers both, which is the one case where
   * a control can change anything.
   */
  brain: CompileBrain | null;
  brainChoosable: boolean;
  onChooseBrain: (brain: CompileBrain) => void;
  /** True in the installed app. On the web, Compile has no runtime at all. */
  inApp: boolean;
  onAddFiles: () => void;
  onFindDocuments: () => void;
  onCompile: () => void;
  /**
   * The report-only health check (PR #1486), beside Compile in step two.
   *
   * Null where no verified coding agent can run it, which is the same condition the index
   * uses — and unlike Compile it is **absent** rather than disabled there, because a step
   * that cannot report is not a step with a reason, it is a step with no runtime.
   */
  onLint: (() => void) | null;
  /**
   * Why Check the wiki cannot run, when it cannot — the sentence this screen already owns.
   *
   * Until 2026-09-11 this control was **absent** without a coding agent, on the reasoning
   * that "a step that cannot report is not a step with a reason, it is a step with no
   * runtime". The record "The Library keeps its spine, and computes the structural check
   * itself" overturns that half: a feature the product has stays on screen, and
   * availability is a state with its reason. `null` on both this and `onLint` keeps the
   * control absent, because no sentence in `messages/*.json` is true of that state yet.
   */
  lintBlockedReason: string | null;
  onOpenWiki: (slug: string) => void;
  /**
   * The slugs step three lists as saved questions, so it does not advertise one twice.
   *
   * Measured 2026-09-11 on the seeded folder: the newest page *was* the saved answer, so
   * "Start with <title>" and the question row beneath it were the same door, 180px apart
   * inside one card. "Start with" names the newest **write-up**; a saved answer has its
   * own row, and the two lists stopped overlapping once this set was subtracted.
   */
  answerSlugs?: ReadonlySet<string>;
  /**
   * The saved questions and their Ask control, seated inside step three.
   *
   * Reading is what step three names, and a saved answer is the most finished thing this
   * folder holds — so the list belongs in that row rather than above the whole stepper,
   * where it used to replace it (`docs/DECISIONS.md`, 2026-09-11).
   */
  questions?: ReactNode;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}

/**
 * One row. The shell is identical for all three, which is what makes the heights match:
 * head line, exactly one caption line, and one action row with a reserved height.
 */
function Step({
  index,
  title,
  caption,
  state,
  lead,
  action,
  extra,
  testId,
  t,
}: {
  index: number;
  title: string;
  /** One line, always present. A row whose caption is optional moves the rows under it. */
  caption: string;
  state: LibraryStepState;
  /**
   * Whether this is the **first** step that is next. Two steps can honestly be next at
   * once, but two indigo edges is no emphasis at all, so the edge goes to the earliest.
   */
  lead: boolean;
  action: ReactNode;
  /** Step two's own state: the blocked reason, the runner's card, the transfer sentence. */
  extra?: ReactNode;
  testId: string;
  t: LibraryStageProps["t"];
}) {
  return (
    <li
      data-testid={testId}
      data-step-state={state}
      className={cn(
        "flex flex-col rounded-panel border bg-[color:var(--color-panel)] px-3 py-2.5",
        lead
          ? "border-[color:var(--color-indigo-line-a35)]"
          : "border-[color:var(--color-border-soft)]",
      )}
    >
      <div data-testid="library-step-core" className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
            {index}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
            {title}
          </h3>
          {/*
            The step's own word, in ink rather than in a badge. Measured on 2026-09-06:
            three bordered `micro` badges in a 360px panel put four rounded rectangles on
            one line with the row's own border, and the eye counted boxes instead of
            reading the sequence. `next` keeps the one indigo the row's edge already
            carries, so the emphasis is said once in two places rather than twice.
          */}
          <span
            data-testid={`library-stage-state-${state}`}
            /*
             * **The word stays true; only the emphasis is singular.** Two steps can
             * honestly be next at once — a folder with pages written and sources still
             * waiting can be compiled or read — and both rows say `next`. Measured at
             * 1512 on the seeded folder, painting both indigo put two accents in a 360px
             * panel and the eye found neither. So the ink follows the lead edge.
             */
            className={cn(
              "flex-none text-label leading-body tabular-nums",
              lead
                ? "text-[color:var(--color-indigo-text-soft)]"
                : "text-[color:var(--color-text-quaternary)]",
            )}
          >
            {t(`stage.state.${state}`)}
          </span>
        </div>
        <p className="truncate text-label leading-body text-[color:var(--color-text-tertiary)]">
          {caption}
        </p>
      </div>
      {/*
        `min-h-8` is the chip's own height, reserved whether or not this row has a control
        to put in it — the read step has none until a page exists, and a slot that
        disappears moves everything under it (`.claude/rules/design.md`, dimensional
        regularity).
      */}
      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2">{action}</div>
      {extra}
    </li>
  );
}

export function LibraryStage({
  model,
  route,
  agentLabel,
  localModel,
  brain,
  brainChoosable,
  onChooseBrain,
  inApp,
  onAddFiles,
  onFindDocuments,
  onCompile,
  onLint,
  lintBlockedReason,
  onOpenWiki,
  answerSlugs,
  questions,
  busy,
  t,
}: LibraryStageProps) {
  const sourceCount = model.sources.length;
  const formats = countSourceFormats(model.sources);
  const newest = newestWikiPage(
    answerSlugs && answerSlugs.size > 0
      ? model.wikiPages.filter((page) => !answerSlugs.has(page.slug))
      : model.wikiPages,
  );

  /**
   * **What leaves the computer, said once**, and said where the press is.
   *
   * The index carries this sentence whenever this panel is closed (`LibraryPage`), so
   * exactly one surface prints it and neither can name a different brain.
   */
  const transfer = libraryTransferSentence({ route, localModel }, t);

  const blocked = libraryCompileBlockedReason(
    { route, inApp, sourceCount, needsCompileCount: model.needsCompileCount, localModel, sources: model.sources },
    t,
  );

  const {
    gather: gatherState,
    compile: compileState,
    read: readState,
    leadIndex,
    checkingCount,
  } = libraryStepStates(model);

  /** Which coverage sentence step three prints, and with which numbers. */
  const coverage = libraryCoverageCaption(model, checkingCount);

  /** Step one's line: the formats the folder actually holds, in the index's own words. */
  const gatherCaption =
    formats.length === 0
      ? t("stage.none")
      : formats
          .map((entry) =>
            t("stage.formatEntry", {
              format: entry.format ? entry.format.toUpperCase() : t("sources.noFormat"),
              count: entry.count,
            }),
          )
          .join(" · ");

  /*
   * Step two's line is the **index's own sentence**, not a second phrasing of it: the
   * same counts appear beside the file rows, and one word per thing is a repository rule.
   */
  /*
   * ⚠️ **The reason is not printed twice.** With every source written up, the caption and
   * the blocked reason are the same sentence — `blockedNothingWaiting` — and step two
   * showed it in both slots, 40px apart (measured on the owner's seven-page folder,
   * 2026-09-07). The caption keeps it, because a row's caption is always drawn; the
   * paragraph under the button appears only when it has something else to say.
   */
  const waitingLine = libraryWaitingLine(model, t);
  const compileCaption =
    waitingLine ??
    (checkingCount > 0
      ? // Not "every source already has a write-up that matches its bytes": nothing has
        // been measured yet, so that sentence would be a claim about files nobody read.
        t("stage.compile.checkingLine", { count: checkingCount })
      : t("stage.blockedNothingWaiting"));

  /**
   * The reason under the button, unless the caption above it is already that sentence.
   *
   * ⚠️ **While the hashes are still being taken, "everything already matches" is not a
   * reason — it is a guess.** `libraryCompileBlockedReason` says it whenever nothing is
   * *known* to be waiting, which is also true of a folder nobody has measured yet. The
   * reason becomes the same checking sentence the caption carries, and the dedupe below
   * then prints it once. The button stays disabled either way: there is still nothing this
   * press could compile.
   */
  const blockedReason =
    blocked !== null && checkingCount > 0 && blocked === t("stage.blockedNothingWaiting")
      ? compileCaption
      : blocked;
  const blockedBelow = blockedReason && blockedReason !== compileCaption ? blockedReason : null;

  /**
   * **Why a partial read is worth a second run**, once and without a number.
   *
   * The caption above already counts them, and this screen's standing rule is that a
   * reason is not printed twice. What the count cannot say is that the cure is the
   * ordinary Compile button already sitting in this row — so this is the sentence and not
   * a control: a partial page needs the same press, not a different one.
   */
  const partialNote = model.partialCount > 0 ? t("stage.compile.partialLine") : null;

  /**
   * Check the wiki's own reason, and whether this row has to print it.
   *
   * ⚠️ **A reason is not printed twice.** Without an agent the two controls in this row
   * are blocked by the same fact, and `libraryCompileBlockedReason` already returns that
   * sentence — so when Compile's caption or paragraph is carrying it, the lint paragraph
   * is not drawn at all and the button points at Compile's copy of it instead.
   */
  const lintBlocked = onLint === null ? lintBlockedReason : null;
  const lintBlockedBelow =
    lintBlocked && lintBlocked !== blockedBelow && lintBlocked !== compileCaption ? lintBlocked : null;

  return (
    <div data-testid="library-stage" className="w-full px-3 pb-3 pt-2">
      {/* No lede and no title: the panel's own header states both, and the same words
          twice, 40px apart, is the header competition this screen keeps finding. */}
      <ol className="flex flex-col gap-2">
        <Step
          index={1}
          testId="library-stage-gather"
          lead={leadIndex === 0}
          title={t("stage.gather.title")}
          caption={gatherCaption}
          state={gatherState}
          t={t}
          action={
            <>
              <button
                type="button"
                onClick={onAddFiles}
                disabled={busy}
                data-testid="library-stage-add-files"
                className={controlClass({ shape: "chip", tone: "muted", hoverInk: "strong", className: "gap-1.5" })}
              >
                <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
                {t("sources.add")}
              </button>
              <button
                type="button"
                onClick={onFindDocuments}
                disabled={busy}
                data-testid="library-stage-find-documents"
                className={controlClass({ shape: "chip", tone: "muted", hoverInk: "strong", className: "gap-1.5" })}
              >
                <Search size={ICON_SIZE.sm} aria-hidden />
                {t("sources.find")}
              </button>
            </>
          }
        />

        <Step
          index={2}
          testId="library-stage-compile"
          lead={leadIndex === 1}
          title={t("stage.compile.title")}
          caption={compileCaption}
          state={compileState}
          t={t}
          action={
            <>
              <button
                type="button"
                onClick={onCompile}
                disabled={busy || blocked !== null}
                data-testid="library-stage-compile-button"
                /*
                 * Tied to its reason, not merely next to it: a `disabled` button is out of
                 * the tab order, so the sentence beneath it is reachable only by reading
                 * on. The visual disabled state stays the system's.
                 */
                /* Only when that paragraph is actually drawn; when the caption above is
                   the reason, the row already reads it. */
                aria-describedby={blockedBelow ? "library-stage-compile-blocked" : undefined}
                className={controlClass({
                  shape: "chip",
                  tone: blocked === null ? "strong" : "muted",
                  hoverSurface: blocked === null ? "lift" : "none",
                  hoverBorder: blocked === null ? "strong" : "none",
                  className: "gap-1.5",
                })}
              >
                <Sparkles size={ICON_SIZE.sm} aria-hidden />
                {t("wiki.compile")}
              </button>
              {/*
                **Reading is the other half of step two** (PR #1486, merged 2026-09-07).
                Compile writes the pages; Check the wiki reads them back and reports what a
                script cannot decide. It stands here rather than in a step of its own
                because it is the same job seen from the other end, and a fourth row would
                make the sequence longer than the work. It appears only once there are two
                pages, which is the first moment two pages can disagree.
              */}
              {(onLint || lintBlocked) && model.wikiPages.length >= 2 ? (
                <button
                  type="button"
                  onClick={onLint ?? undefined}
                  disabled={busy || onLint === null}
                  data-testid="library-stage-lint"
                  /* Same binding Compile uses: the sentence below is what a disabled
                     control has instead of a press, so it is announced with it. */
                  aria-describedby={lintBlockedBelow ? "library-stage-lint-blocked" : undefined}
                  className={controlClass({
                    shape: "chip",
                    tone: "muted",
                    hoverInk: "strong",
                    className: "gap-1.5",
                  })}
                >
                  <Stethoscope size={ICON_SIZE.sm} aria-hidden />
                  {t("wiki.lint")}
                </button>
              ) : null}
              {brainChoosable ? (
                <CompileBrainSelect
                  brain={brain}
                  agentLabel={agentLabel}
                  localModel={localModel}
                  onChoose={onChooseBrain}
                  className="min-w-0 max-w-full flex-1"
                  t={t}
                />
              ) : null}
              {!inApp ? (
                /*
                 * A **chip**, not a link. `shape: "link"` is excluded from the coarse 44px
                 * floor because it ends a sentence; here it stands in an action row beside
                 * a button, where that exclusion would leave a ~25px target on a tablet.
                 */
                <Link
                  href="/download"
                  data-testid="library-stage-get-app"
                  /*
                   * **The live control in a dead row wears the strong ink** (design-lead,
                   * 2026-09-06). On the web the lead row says "next" and its own Compile
                   * button is disabled, so the strongest box on the screen had a dead
                   * centre; the only thing a person can press here is this. When Compile
                   * can run it is the one that leads and this recedes.
                   */
                  className={controlClass({
                    shape: "chip",
                    tone: blocked === null ? "muted" : "strong",
                    hoverInk: "strong",
                  })}
                >
                  {t("wiki.compileWebGetApp")}
                </Link>
              ) : null}
            </>
          }
          extra={
            blockedBelow || lintBlockedBelow || partialNote || transfer ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {blockedBelow ? (
                  <p
                    id="library-stage-compile-blocked"
                    data-testid="library-stage-compile-blocked"
                    className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
                  >
                    {blockedBelow}
                  </p>
                ) : null}
                {lintBlockedBelow ? (
                  <p
                    id="library-stage-lint-blocked"
                    data-testid="library-stage-lint-blocked"
                    className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
                  >
                    {lintBlockedBelow}
                  </p>
                ) : null}
                {/* After the reason, never before it: why the button is dead is what a
                    person reads first, and this is what the press would be worth. */}
                {partialNote ? (
                  <p
                    data-testid="library-stage-compile-partial"
                    className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
                  >
                    {partialNote}
                  </p>
                ) : null}
                {transfer ? (
                  <p
                    data-testid="library-stage-transfer"
                    className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
                  >
                    {transfer}
                  </p>
                ) : null}
              </div>
            ) : null
          }
        />

        <Step
          index={3}
          testId="library-stage-read"
          lead={leadIndex === 2}
          title={t("stage.read.title")}
          /*
             ⚠️ **A source that has not been measured is neither covered nor waiting.** The
             plain line read "0 of 7 written up" beside a step two that said everything was
             done, because `needsCompileCount` counts only what is *known* to be waiting.
             The third clause is what makes the two agree.
          */
          /*
            A part-read source is not written up, so it is not in `compiled`; with one page
            on the shelf the plain line read "0 of 2 written up" and looked like a folder
            with no pages at all. The third clause is the same repair the `checking` one is.
          */
          /*
            ⚠️ **`stale` needed the very same repair and had been missed** (2026-09-09).
            Which clause wins now lives in `libraryCoverageCaption`, beside the arithmetic
            the rest of this stepper reads, so the next state to need a clause is caught by
            a test rather than by an owner reading a real folder for the fourth time.
          */
          caption={t(`stage.read.${coverage.key}`, coverage.values)}
          state={readState}
          t={t}
          action={
            newest ? (
              <button
                type="button"
                onClick={() => onOpenWiki(newest.slug)}
                data-testid="library-stage-start-with"
                className={controlClass({
                  shape: "chip",
                  tone: "muted",
                  hoverInk: "strong",
                  className: "max-w-full gap-1.5",
                })}
              >
                <BookText size={ICON_SIZE.sm} aria-hidden />
                <span className="min-w-0 truncate">
                  {t("stage.read.startWith", { title: newest.title })}
                </span>
              </button>
            ) : (
              <p className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
                {t("stage.read.nothingYet")}
              </p>
            )
          }
          /*
            The saved questions sit under step three's own action row, divided from it,
            because they are the row's content rather than a second control: the step says
            what reading is, and this is what there is to read again.
          */
          extra={
            questions ? (
              <div
                data-testid="library-stage-questions"
                className="mt-3 border-t border-[color:var(--color-border-soft)] pt-3"
              >
                {questions}
              </div>
            ) : null
          }
        />
      </ol>
    </div>
  );
}
