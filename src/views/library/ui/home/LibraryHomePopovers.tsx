import type { RefObject, Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { selectCompileBatch, type LibraryUiModel, type RetainedAnswerHead } from "@/features/library";
import { controlClass } from "@/shared/ui/control-class";
import { libraryProviderDisclosure } from "../../lib/compile/compile-availability";
import { libraryWaitingLine } from "../../lib/compile/stage-steps";
import type { CompileBatchState } from "../../lib/compile/use-compile-batch";
import { useLibraryAgent } from "../../lib/agent/use-library-agent";
import { AgentDoor } from "../agent/AgentDoor";
import { CompileBrainSelect } from "../compile/CompileBrainSelect";
import { LibraryStage } from "../compile/LibraryStage";
import { LibraryQuestions } from "../questions/LibraryQuestions";
import { LibraryUsageRows } from "../first-run/LibraryUsageRows";
import { LibraryHomePopover } from "./LibraryHomePopover";
import type { LibrarySelection, LibraryHomeSurface } from "../../model/library-selection";
import type { useLibrarySources } from "../../model/sources/use-library-sources";
import type { useLibraryHome } from "../../model/home/use-library-home";
import type { useLibraryTurns } from "../../model/turns/use-library-turns";
import type { libraryHomeStrip } from "../../model/home/library-home-strip";

export function LibraryHomePopovers({
  t, nativeVaultRootPath, homeSurface, setHomeSurface, guideDoorRef, questionsDoorRef,
  compileClauseRef, overflowDoorRef, choose, busy, model, retainedAnswers, knownOriginalPaths,
  retainedAnswerSlugs, agent, closeHomeSurface, handleCompile, sources, home, turns, agentDoor,
  homeStrip, compileBatch, folderName,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  nativeVaultRootPath: string | null;
  /** The open folder's name, for Usage's rows. */
  folderName: string;
  homeSurface: LibraryHomeSurface;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  guideDoorRef: RefObject<HTMLButtonElement | null>;
  questionsDoorRef: RefObject<HTMLButtonElement | null>;
  compileClauseRef: RefObject<HTMLButtonElement | null>;
  overflowDoorRef: RefObject<HTMLButtonElement | null>;
  choose: (next: LibrarySelection) => void;
  busy: boolean;
  model: LibraryUiModel;
  retainedAnswers: readonly RetainedAnswerHead[];
  knownOriginalPaths: Set<string>;
  retainedAnswerSlugs: Set<string>;
  agent: ReturnType<typeof useLibraryAgent>;
  closeHomeSurface: () => void;
  handleCompile: () => void;
  sources: ReturnType<typeof useLibrarySources>;
  home: ReturnType<typeof useLibraryHome>;
  turns: ReturnType<typeof useLibraryTurns>;
  /** The app has no agent to write with, so a blocked write names the agents page. */
  agentDoor: boolean;
  homeStrip: ReturnType<typeof libraryHomeStrip>;
  /** What the next Continue press names (`useCompileBatch`); derived from the list when absent. */
  compileBatch?: Pick<CompileBatchState, "targets" | "rest" | "returned">;
}) {
  const { sourceImportFeedback, handleAddFiles, handleFindDocuments } = sources;
  const { closeGuide } = home;
  const { handleLint, compileBlocked, compileTransfer, agentOnlyReason } = turns;
  const { compileTarget, overflowDoors } = homeStrip;
  const batch = compileBatchView(compileBatch, model);
  const providerDisclosure = libraryProviderDisclosure({ route: agent.route }, t);
  return (
    <>
      <LibraryHomePopover
        open={homeSurface === "guide"}
        onClose={closeGuide}
        anchorRef={guideDoorRef}
        fallbackAnchorRef={overflowDoorRef}
        title={t("stage.title")}
        testId="library-guide-popover"
        t={t}
      >
        <div data-testid="library-guide-lede" className="px-4 pt-3 text-body [word-break:keep-all]">
          <p className="text-[color:var(--color-text-secondary)]">{t("lede")}</p>
          {providerDisclosure ? (
            <p className="mt-1.5 text-[color:var(--color-text-tertiary)]">{providerDisclosure}</p>
          ) : null}
        </div>
        <LibraryStage
          model={model}
          route={agent.route}
          agentLabel={agent.runtime?.label ?? null}
          localModel={agent.localModel}
          brain={agent.brain}
          brainChoosable={agent.brainChoosable}
          onChooseBrain={agent.chooseBrain}
          inApp={nativeVaultRootPath !== null}
          onAddFiles={handleAddFiles}
          addFilesFeedback={homeSurface === 'guide' ? sourceImportFeedback : 'idle'}
          onFindDocuments={handleFindDocuments}
          onCompile={handleCompile}
          onLint={agent.route === "agent" ? handleLint : null}
          lintBlockedReason={agentOnlyReason}
          lintBlockedReasonId={null}
          agentDoor={agentDoor}
          onOpenWiki={(slug) => { closeGuide(); choose({ kind: "wiki", slug }); }}
          answerSlugs={retainedAnswerSlugs}
          busy={busy}
          questions={null}
          t={t}
        />
        <LibraryUsageRows folderName={folderName} t={t} />
      </LibraryHomePopover>
      <LibraryHomePopover
        open={homeSurface === "questions"}
        onClose={closeHomeSurface}
        anchorRef={questionsDoorRef}
        fallbackAnchorRef={overflowDoorRef}
        title={t("answers.title")}
        testId="library-questions-popover"
        t={t}
      >
        <div className="px-4 py-3">
          <LibraryQuestions
            answers={retainedAnswers}
            knownSources={knownOriginalPaths}
            hashes={model.hashes}
            onOpen={(slug) => { setHomeSurface(null); choose({ kind: "wiki", slug }); }}
            onAsk={agent.route === "agent" ? () => { setHomeSurface(null); agent.setOpen(true); } : null}
            askBlockedReason={agentOnlyReason}
            askBlockedReasonId={null}
            agentDoor={agentDoor}
            headingHidden
            t={t}
          />
        </div>
      </LibraryHomePopover>
      <LibraryHomePopover
        open={homeSurface === "compile"}
        onClose={closeHomeSurface}
        anchorRef={compileClauseRef}
        fallbackAnchorRef={overflowDoorRef}
        title={
          compileTarget
            ? t("home.compileTitle", { source: compileTarget.path.replace(/^sources\//, "") })
            : t("stage.compile.title")
        }
        testId="library-compile-popover"
        align="start"
        t={t}
      >
        <div className="flex flex-col gap-2 px-4 py-3">
          <p
            data-testid="library-needs-compile"
            className="text-label leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
          >
            {libraryWaitingLine(model, t) ?? t("stage.blockedNothingWaiting")}
          </p>
          {batch.paths.length > 0 ? (
            <ol
              data-testid="library-compile-batch"
              aria-labelledby="library-compile-popover-run"
              className="flex min-w-0 flex-col gap-0.5"
            >
              {batch.paths.map((path) => (
                <li
                  key={path}
                  title={path}
                  className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-secondary)]"
                >
                  {path.replace(/^sources\//, "")}
                </li>
              ))}
            </ol>
          ) : null}
          {batch.rest > 0 ? (
            <p
              data-testid="library-compile-batch-rest"
              className="text-caption leading-body text-[color:var(--color-text-tertiary)]"
            >
              {t("progress.batchRest", { count: batch.rest })}
            </p>
          ) : null}
          {batch.returned > 0 ? (
            <p
              data-testid="library-compile-batch-returned"
              className="text-caption leading-body text-[color:var(--color-text-tertiary)]"
            >
              {t("progress.batchReturned", { count: batch.returned })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setHomeSurface(null); handleCompile(); }}
              disabled={busy || compileBlocked !== null}
              id="library-compile-popover-run"
              data-testid="library-compile-popover-run"
              aria-describedby={compileBlocked ? "library-compile-popover-blocked" : undefined}
              className={controlClass({
                shape: "chip",
                tone: compileBlocked === null ? "strong" : "muted",
                hoverSurface: compileBlocked === null ? "lift" : "none",
                hoverBorder: compileBlocked === null ? "strong" : "none",
                className: "gap-1.5",
              })}
            >
              {/* One named source with more behind it is not "the last source". */}
              {batch.paths.length > 1 || (batch.paths.length === 1 && batch.rest === 0)
                ? t("progress.continue", { count: batch.paths.length })
                : t("wiki.compile")}
            </button>
            {agent.brainChoosable ? (
              <CompileBrainSelect
                brain={agent.brain}
                agentLabel={agent.runtime?.label ?? null}
                localModel={agent.localModel}
                onChoose={agent.chooseBrain}
                className="min-w-0 max-w-full flex-1"
                t={t}
              />
            ) : null}
          </div>
          {compileBlocked ? (
            <p
              id="library-compile-popover-blocked"
              data-testid="library-compile-popover-blocked"
              className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
            >
              {compileBlocked}
            </p>
          ) : compileTransfer ? (
            <p
              data-testid="library-transfer"
              className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
            >
              {compileTransfer}
            </p>
          ) : null}
          {compileBlocked && agentDoor ? (
            <div className="flex">
              <AgentDoor testId="library-compile-popover-blocked-door" />
            </div>
          ) : null}
        </div>
      </LibraryHomePopover>
      <LibraryHomePopover
        open={homeSurface === "overflow"}
        onClose={closeHomeSurface}
        anchorRef={overflowDoorRef}
        title={t("home.more")}
        testId="library-home-overflow-popover"
        t={t}
      >
        <ul className="flex flex-col p-1">
          {overflowDoors.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                data-testid={`${entry.testId}-overflow`}
                title={entry.tooltip}
                onClick={() => { setHomeSurface(null); entry.onPress(); }}
                className={controlClass({
                  shape: "row",
                  tone: "secondary",
                  hoverInk: "strong",
                  hoverSurface: "lift",
                  className: "w-full",
                })}
              >
                <span className="min-w-0 truncate">{entry.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </LibraryHomePopover>
    </>
  );
}

/**
 * The batch the press names: the session's batch, which on the local route holds only files that
 * runner can open and is the list its brief and system prompt receive.
 */
function compileBatchView(
  given: Pick<CompileBatchState, "targets" | "rest" | "returned"> | undefined,
  model: LibraryUiModel,
): { paths: readonly string[]; rest: number; returned: number } {
  const batch = given ?? selectCompileBatch(model.sources);
  return {
    paths: batch.targets.map((row) => row.path),
    rest: batch.rest,
    returned: "returned" in batch ? batch.returned : 0,
  };
}
