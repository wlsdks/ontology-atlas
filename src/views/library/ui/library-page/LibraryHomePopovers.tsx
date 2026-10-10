import type { RefObject, Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { controlClass } from "@/shared/ui/control-class";
import { libraryWaitingLine } from "../../lib/stage-steps";
import { useLibraryAgent } from "../../lib/use-library-agent";
import { AgentDoor } from "../parts/AgentDoor";
import { CompileBrainSelect } from "../parts/CompileBrainSelect";
import { LibraryStage } from "../parts/LibraryStage";
import { LibraryQuestions } from "../parts/LibraryQuestions";
import { LibraryHomePopover } from "../parts/LibraryHomePopover";
import type { LibraryUiModel, RetainedAnswerHead } from "@/features/library";
import type { LibrarySelection, LibraryHomeSurface } from "./library-page-state";
import type { useLibrarySources } from "./use-library-sources";
import type { useLibraryHome } from "./use-library-home";
import type { useLibraryTurns } from "./use-library-turns";
import type { useLibraryGraphCards } from "./use-library-graph-cards";
import type { libraryHomeStrip } from "./library-home-strip";

export function LibraryHomePopovers({
  t, nativeVaultRootPath, homeSurface, setHomeSurface, guideDoorRef, questionsDoorRef,
  compileClauseRef, overflowDoorRef, choose, busy, model, retainedAnswers, knownOriginalPaths,
  retainedAnswerSlugs, agent, closeHomeSurface, handleCompile, sources, home, turns, graphCards,
  homeStrip,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  nativeVaultRootPath: string | null;
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
  graphCards: ReturnType<typeof useLibraryGraphCards>;
  homeStrip: ReturnType<typeof libraryHomeStrip>;
}) {
  const { sourceImportFeedback, handleAddFiles, handleFindDocuments } = sources;
  const { closeGuide } = home;
  const { handleLint, compileBlocked, compileTransfer, agentOnlyReason } = turns;
  const { agentDoor } = graphCards;
  const { compileTarget, homeClauses, homeDoors } = homeStrip;
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setHomeSurface(null); handleCompile(); }}
              disabled={busy || compileBlocked !== null}
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
              {t("wiki.compile")}
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
          {[...homeClauses.filter((clause) => clause.kind !== "compile"), ...homeDoors].map((entry) => (
            <li key={"kind" in entry ? entry.kind : entry.id}>
              <button
                type="button"
                data-testid={`${entry.testId}-overflow`}
                onClick={() => { setHomeSurface(null); entry.onPress(); }}
                className={controlClass({
                  shape: "row",
                  tone: "secondary",
                  hoverInk: "strong",
                  hoverSurface: "lift",
                  className: "w-full",
                })}
              >
                <span className="min-w-0 truncate">{"text" in entry ? entry.text : entry.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </LibraryHomePopover>
    </>
  );
}
