"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/status-glyphs/ActionFeedbackGlyph';
import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { BookText, FilePlus2, Search, Sparkles, Stethoscope } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import type { CompileAvailability } from "../../lib/compile/compile-availability";
import type { CompileBrain } from "../../lib/compile/compile-brain";
import type { LibraryUiModel } from "@/features/library";
import type { LibraryLocalModel } from "../../lib/agent/use-library-agent";
import { libraryStageLines } from "../../model/compile/library-stage-lines";
import { CompileBrainSelect } from "./CompileBrainSelect";
import { CompileStepNotes } from "./CompileStepNotes";
import { StageStep as Step } from "./StageStep";

/**
 * Three rows, not three essays: `libraryStepStates` decides done/next/waiting for this stage and the
 * header strip. The transfer sentence, blocked reason and local runner card sit in step two under
 * Compile, the one row whose height may differ.
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
   * The brain that will run; `choosable` is true only when this computer offers both, the one case where
   * a control can change anything.
   */
  brain: CompileBrain | null;
  brainChoosable: boolean;
  onChooseBrain: (brain: CompileBrain) => void;
  /** True in the installed app. On the web, Compile has no runtime at all. */
  inApp: boolean;
  onAddFiles: () => void;
  addFilesFeedback?: ActionFeedbackState;
  onFindDocuments: () => void;
  onCompile: () => void;
  /**
   * The report-only health check beside Compile in step two; null where no verified coding agent can
   * run it.
   */
  onLint: (() => void) | null;
  /**
   * Why Check the wiki cannot run, when it cannot. `null` on both this and `onLint` keeps the control
   * absent, because no sentence in `messages/*.json` is true of that state.
   */
  lintBlockedReason: string | null;
  /**
   * Where that sentence is printed: `LibraryPage` decides which card prints it once and passes that
   * element's id, so Check the wiki points at the surviving paragraph. `null` means no sentence
   * exists.
   */
  lintBlockedReasonId: string | null;
  /**
   * Whether the printed reason earns a door to `/agents`: true only for the agent-availability sentences,
   * false on the web (the `/download/` card is the door there) and while an agent is still being looked for.
   */
  agentDoor: boolean;
  onOpenWiki: (slug: string) => void;
  /** The slugs step three lists as saved questions, so Start with does not advertise the same page twice. */
  answerSlugs?: ReadonlySet<string>;
  /**
   * The saved questions and their Ask control, seated inside step three: a saved answer is the most
   * finished thing the folder holds, so the list belongs in that row rather than above the stepper.
   */
  questions?: ReactNode;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
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
  addFilesFeedback = 'idle',
  onFindDocuments,
  onCompile,
  onLint,
  lintBlockedReason,
  lintBlockedReasonId,
  agentDoor,
  onOpenWiki,
  answerSlugs,
  questions,
  busy,
  t,
}: LibraryStageProps) {
  const {
    steps: { gather: gatherState, compile: compileState, read: readState, leadIndex },
    newest, transfer, blocked, gatherCaption, compileCaption, blockedBelow, partialNote,
    lintBlocked, lintReasonBelow, lintReasonId, coverage,
  } = libraryStageLines({
    model, route, inApp, localModel, canCheck: onLint !== null, lintBlockedReason, lintBlockedReasonId, answerSlugs, t,
  });

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
              aria-busy={addFilesFeedback === 'working' || undefined}
                className={controlClass({ shape: "chip", tone: "muted", hoverInk: "strong", className: "gap-1.5" })}
              >
                <ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
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
              {/* Reading is the other half of step two: Check the wiki reads back the pages Compile writes. It
                 appears only once there are two pages, the first moment two pages can disagree. */}
              {(onLint || lintBlocked) && model.wikiPages.length >= 2 ? (
                <button
                  type="button"
                  onClick={onLint ?? undefined}
                  disabled={busy || onLint === null}
                  data-testid="library-stage-lint"
                  /* Same binding Compile uses: the landing's one availability sentence is
                     what a disabled control has instead of a press, so it is announced
                     with it — wherever on this landing that paragraph stands. */
                  aria-describedby={lintBlocked ? (lintReasonId ?? undefined) : undefined}
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
                   * The live control in a dead row wears the strong ink: on the web Compile is disabled, so this link
                   * is the only thing a person can press. When Compile can run it leads and this recedes.
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
            <CompileStepNotes
              blockedBelow={blockedBelow}
              lintReasonBelow={lintReasonBelow}
              partialNote={partialNote}
              transfer={transfer}
              agentDoor={agentDoor}
            />
          }
        />

        <Step
          index={3}
          testId="library-stage-read"
          lead={leadIndex === 2}
          title={t("stage.read.title")}
          /*
           * A source not yet measured is neither covered nor waiting: `needsCompileCount` counts only what is
           * known to be waiting, so the plain line needs a third clause to agree with step two.
           */
          /*
            A part-read source is not written up, so it is not in `compiled`; with one page
            on the shelf the plain line read "0 of 2 written up" and looked like a folder
            with no pages at all. The third clause is the same repair the `checking` one is.
          */
          /*
           * Which coverage clause wins lives in `libraryCoverageCaption`, beside the arithmetic the rest of
           * this stepper reads, so a state that needs a clause is caught by a test.
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
