"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { BookText, FilePlus2, Search, Sparkles } from "lucide-react";

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
import type { LocalCompileSession } from "@/features/vault-agent";

import type { CompileBrain } from "../../lib/compile-brain";
import { libraryStepStates, type LibraryStepState } from "../../lib/stage-steps";
import type { LibraryUiModel } from "../../lib/use-library-model";
import type { LibraryLocalModel } from "../../lib/use-library-agent";
import { CompileBrainSelect } from "./CompileBrainSelect";
import { LocalCompileCard } from "./LocalCompileCard";

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
 * | the Gather card carried ~130px of empty space between its numbers and its buttons | there is no stretch: every row is head, one caption line, one action row, so the heights match because the **anatomy** does, not because a grid pulled them |
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
  localCompile: LocalCompileSession | null;
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
  onOpenWiki: (slug: string) => void;
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
  localCompile,
  brain,
  brainChoosable,
  onChooseBrain,
  inApp,
  onAddFiles,
  onFindDocuments,
  onCompile,
  onOpenWiki,
  busy,
  t,
}: LibraryStageProps) {
  const sourceCount = model.sources.length;
  const formats = countSourceFormats(model.sources);
  const newest = newestWikiPage(model.wikiPages);
  const compiledCount = model.sources.filter((row) => row.state === "compiled").length;

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

  const { gather: gatherState, compile: compileState, read: readState, leadIndex } =
    libraryStepStates(model);

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
  const compileCaption =
    model.needsCompileCount === 0
      ? t("stage.blockedNothingWaiting")
      : model.staleCount > 0 && model.notCompiledCount > 0
        ? t("sources.needsCompileSplit", {
            notCompiled: model.notCompiledCount,
            stale: model.staleCount,
          })
        : model.staleCount > 0
          ? t("sources.staleOnly", { count: model.staleCount })
          : t("sources.needsCompile", { count: model.notCompiledCount });

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
                aria-describedby={blocked ? "library-stage-compile-blocked" : undefined}
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
            blocked || (localCompile && route === "local") || transfer ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {blocked ? (
                  <p
                    id="library-stage-compile-blocked"
                    data-testid="library-stage-compile-blocked"
                    className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
                  >
                    {blocked}
                  </p>
                ) : null}
                {localCompile && route === "local" ? (
                  <LocalCompileCard session={localCompile} model={localModel?.model ?? ""} t={t} />
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
          caption={t("stage.read.coveredLine", { compiled: compiledCount, total: sourceCount })}
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
        />
      </ol>
    </div>
  );
}
