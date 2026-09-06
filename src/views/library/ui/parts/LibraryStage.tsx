"use client";

import type { useTranslations } from "next-intl";
import { BookText, FilePlus2, Search, Sparkles } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { countSourceFormats, lastSourceAddedAt, newestWikiPage } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  libraryBrainLabel,
  libraryCompileBlockedReason,
  libraryTransferSentence,
  type CompileAvailability,
} from "../../lib/compile-availability";
import type { LocalCompileSession } from "@/features/vault-agent";

import type { CompileBrain } from "../../lib/compile-brain";

import type { LibraryUiModel } from "../../lib/use-library-model";
import type { LibraryLocalModel } from "../../lib/use-library-agent";
import { CompileBrainSelect } from "./CompileBrainSelect";
import { LocalCompileCard } from "./LocalCompileCard";

/**
 * **The guided shelf** — what the right pane says when a folder is open and nothing is
 * chosen.
 *
 * The owner opened this screen on 2026-09-06 and said: *"Entering the Library I don't
 * know what to do."* The pane at that moment was one of two sentences — "Nothing gathered
 * yet", or the first wiki page opened on the reader's behalf. Both are answers to a
 * question nobody asked. Neither says what the work **is**, and the first one says it in a
 * folder where three documents are already waiting.
 *
 * So the pane is the work, in the order the work happens: **gather → compile → read**.
 * Each step states its own numbers from the model that already derives them
 * (`vault-library.ts`), carries its own door, and says whether it is done or next. That
 * is the whole design: a person reads three rows and knows both where they are and what
 * the next press does.
 *
 * ## Why the counts and not a picture
 *
 * A step that says "gather your documents" and a step that says "5 sources · PDF 3 ·
 * XLSX 2 · last added 5 Sept" are different products. The second one can be **wrong**,
 * which is what makes it worth reading — and every number here comes from the folder,
 * so a person who disagrees with one can go and look. Numbers sit in a two-column
 * definition list rather than inside a sentence, because a sentence with three numbers
 * in it is read once and re-read every time.
 *
 * ## Equal height
 *
 * `auto-rows-fr` on the container, not padding tuned per card. The three steps carry
 * different amounts of copy and `.claude/rules/design.md` is explicit that a height
 * decided by copy length is a defect; variation here would encode which step happened to
 * be written last.
 *
 * ## What Compile says when it cannot run
 *
 * The button is drawn in every state and **disabled with the reason**, which is the
 * opposite of the index's rule (there the chip is absent when no agent can run). The
 * difference is the surface's job: the index is a list of things to press, so a dead
 * control is noise; this pane exists to explain the work, and a missing step two would
 * leave the sequence with a hole in the middle. The reason is always the specific one —
 * which of the runtime, the folder path, the server or the brain is missing.
 */

export interface LibraryStageProps {
  model: LibraryUiModel;
  route: CompileAvailability["route"];
  /** The verified coding agent's label, when one is what will run. */
  agentLabel: string | null;
  /** The connect-by-address runner, when one is configured on this computer. */
  localModel: LibraryLocalModel | null;
  /**
   * The turn that runner runs, and the card it ends at.
   *
   * The card is seated **inside step two** rather than in a dock. The dock is where a
   * conversation lives; this is one job with one question at the end, and the question is
   * about the step a person just pressed — moving it elsewhere would ask them to look for
   * the answer to their own press.
   */
  localCompile: LocalCompileSession | null;
  /**
   * The brain that will run, and whether the person gets to change it.
   *
   * `choosable` is true only when this computer offers both, which is the one case where
   * a control can change anything; with one brain the static line stays (owner,
   * 2026-09-06 — a rank became a default, because the runner exists to be chosen).
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
  /** Candidates the last “Find documents” run proposed, or null before any run. */
  lastDiscoveryCount: number | null;
  busy: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations<"library">>;
}

type StepState = "done" | "next" | "waiting";

/**
 * The step's own word for where it stands. `done` and `next` are the two that matter;
 * `waiting` is for a step whose turn has not come, and it is deliberately neutral —
 * painting an untouched step as a problem makes a new folder look broken.
 */
function StepBadge({ state, t }: { state: StepState; t: LibraryStageProps["t"] }) {
  return (
    <span
      data-testid={`library-stage-state-${state}`}
      className={badgeClass({
        shape: "micro",
        className: cn(
          "border",
          state === "done"
            ? "border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]"
            : state === "next"
              ? "border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] text-[color:var(--color-indigo-text-soft)]"
              : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
        ),
      })}
    >
      {t(`stage.state.${state}`)}
    </span>
  );
}

/** One step. The shell is identical for all three so that only the content varies. */
function Step({
  index,
  title,
  body,
  state,
  lead,
  facts,
  children,
  testId,
  t,
}: {
  index: number;
  title: string;
  body: string;
  state: StepState;
  /**
   * Whether this is the **first** step that is next.
   *
   * Two steps can honestly be next at once — a folder with pages already written and
   * sources still waiting can be compiled or read — but two indigo edges is no emphasis
   * at all. The state stays true on every badge; the edge goes to the earliest of them,
   * so the screen answers "which one now" with one answer.
   */
  lead: boolean;
  /**
   * Label/value pairs. Each number keeps its own line; none is buried in prose.
   *
   * A value may be a control rather than a string — "Runs on" becomes a picker when this
   * computer offers two brains — so the row draws whatever it is given rather than
   * growing a second row shape beside the definition list.
   */
  facts: Array<{ key: string; label: string; value: React.ReactNode }>;
  children?: React.ReactNode;
  testId: string;
  t: LibraryStageProps["t"];
}) {
  return (
    <section
      data-testid={testId}
      data-step-state={state}
      className={cn(
        "flex flex-col rounded-panel border bg-[color:var(--color-panel)] p-[var(--card-pad)]",
        /*
         * **The step that is next owns the edge, not just a 9.5px chip.** Measured by
         * design-lead on 2026-09-06: two emerald `done` badges outweighed one indigo
         * `next` badge, all three cards carried the same border, and the eye read a
         * catalogue of three equal boxes with nothing leading. Equal height is a rule
         * (`.claude/rules/design.md`), so the emphasis cannot be size; it is the one
         * indigo edge, and it moves with the folder rather than being pinned to a step.
         */
        lead
          ? "border-[color:var(--color-indigo-line-a35)]"
          : "border-[color:var(--color-border-soft)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
          {index}
        </span>
        <h3 className="min-w-0 flex-1 text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        <StepBadge state={state} t={t} />
      </div>
      <p className="mt-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {body}
      </p>
      <dl className="mt-3 flex flex-col gap-1 border-t border-[color:var(--color-border-soft)] pt-2.5">
        {facts.map((fact) => (
          <div key={fact.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {/* One column of labels from `sm` up, where 148px leaves slack in both
                locales (measured: 120px longest English, ~100px Korean). Narrower than
                that the label takes its own line rather than squeezing the number. */}
            <dt className="w-full flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)] sm:w-[148px]">
              {fact.label}
            </dt>
            <dd className="min-w-0 flex-1 text-label tabular-nums text-[color:var(--color-text-secondary)]">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      {/* `mt-auto` is what makes the equal heights readable: with the rows stretched to
          one height, the actions of all three steps line up instead of floating. */}
      {children ? <div className="mt-auto pt-3">{children}</div> : null}
    </section>
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
  lastDiscoveryCount,
  busy,
  locale,
  t,
}: LibraryStageProps) {
  const sourceCount = model.sources.length;
  const formats = countSourceFormats(model.sources);
  const lastAdded = lastSourceAddedAt(model.sources);
  const newest = newestWikiPage(model.wikiPages);
  const compiledCount = model.sources.filter((row) => row.state === "compiled").length;

  const brainName = libraryBrainLabel({ route, agentLabel, localModel }, t);

  /**
   * **What leaves the computer, said once.**
   *
   * The coding agent's disclosure already stands beside the index's Compile chip, and
   * both are on screen together — measured 2026-09-06 in the installed-app capture, the
   * same paragraph appeared twice in one viewport, which teaches a reader to skip it.
   * The local route has no other home, and it is a genuinely different fact that
   * `.claude/rules/local-first.md` refuses to let the other stand in for: the agent talks
   * to its own provider and Atlas does not log it, while the connect-by-address runner is
   * a program on this machine and every request to it leaves a line in the vault's own
   * audit file.
   */
  const transfer = libraryTransferSentence({ route, localModel }, t);

  const blocked = libraryCompileBlockedReason(
    {
      route,
      inApp,
      sourceCount,
      needsCompileCount: model.needsCompileCount,
      localModel,
      sources: model.sources,
    },
    t,
  );

  const gatherState: StepState = sourceCount > 0 ? "done" : "next";
  const compileState: StepState =
    model.needsCompileCount === 0 && model.wikiPages.length > 0
      ? "done"
      : sourceCount > 0
        ? "next"
        : "waiting";
  /*
   * `next` was unreachable here until 2026-09-06: both branches returned `waiting`, so a
   * folder whose pages were all written still showed the last step as one whose turn had
   * not come. Reading is done only when every source is covered; with pages on the shelf
   * and sources still waiting, reading is exactly what to do next.
   */
  const readState: StepState =
    model.wikiPages.length === 0
      ? "waiting"
      : model.needsCompileCount === 0
        ? "done"
        : "next";

  /** The earliest step that is next, or none when every step is done or waiting. */
  const stepStates: StepState[] = [gatherState, compileState, readState];
  const leadIndex = stepStates.indexOf("next");

  const formatSummary =
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

  const lastAddedLabel =
    lastAdded === null
      ? t("stage.none")
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(lastAdded));

  return (
    <div
      data-testid="library-stage"
      className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
    >
      <div className="mx-auto w-full max-w-[760px] px-6 pb-10 pt-8 md:px-10">
        {/* No eyebrow. The index column 250px to the left already carries a caps eyebrow
            and this product's name, and a second identical stack at nearly the same y read
            as two headers competing (design-lead, 2026-09-06). */}
        <h2 className="text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {t("stage.title")}
        </h2>
        <p className="mt-1.5 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
          {t("stage.lede")}
        </p>

        {/* Three rows of one height. See the header: the height is the container's, not
            the copy's. */}
        <div className="mt-5 grid auto-rows-fr gap-3">
          <Step
            index={1}
            testId="library-stage-gather"
            lead={leadIndex === 0}
            title={t("stage.gather.title")}
            body={t("stage.gather.body")}
            state={gatherState}
            t={t}
            facts={[
              {
                key: "sources",
                label: t("stage.gather.sourcesLabel"),
                value: String(sourceCount),
              },
              { key: "formats", label: t("stage.gather.formatsLabel"), value: formatSummary },
              { key: "last", label: t("stage.gather.lastLabel"), value: lastAddedLabel },
              {
                key: "candidates",
                label: t("stage.gather.candidatesLabel"),
                // Before any run this is not zero — it is unknown, and saying zero would
                // tell a person their project holds nothing when nothing has looked.
                value:
                  lastDiscoveryCount === null
                    ? t("stage.gather.candidatesUnknown")
                    : String(lastDiscoveryCount),
              },
            ]}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAddFiles}
                disabled={busy}
                data-testid="library-stage-add-files"
                className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
              >
                <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
                {t("sources.add")}
              </button>
              <button
                type="button"
                onClick={onFindDocuments}
                disabled={busy}
                data-testid="library-stage-find-documents"
                className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
              >
                <Search size={ICON_SIZE.sm} aria-hidden />
                {t("sources.find")}
              </button>
            </div>
          </Step>

          <Step
            index={2}
            testId="library-stage-compile"
            lead={leadIndex === 1}
            title={t("stage.compile.title")}
            body={t("stage.compile.body")}
            state={compileState}
            t={t}
            facts={[
              {
                key: "waiting",
                label: t("stage.compile.waitingLabel"),
                value: String(model.needsCompileCount),
              },
              {
                key: "stale",
                label: t("stage.compile.staleLabel"),
                value: String(model.staleCount),
              },
              {
                key: "brain",
                label: t("stage.compile.brainLabel"),
                value: brainChoosable ? (
                  <CompileBrainSelect
                    brain={brain}
                    agentLabel={agentLabel}
                    localModel={localModel}
                    onChoose={onChooseBrain}
                    className="max-w-[280px]"
                    t={t}
                  />
                ) : (
                  brainName
                ),
              },
            ]}
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onCompile}
                  disabled={busy || blocked !== null}
                  data-testid="library-stage-compile-button"
                  /*
                   * Tied to its reason, not merely next to it. A `disabled` button is out
                   * of the tab order, so the sentence beneath it is reachable only by
                   * reading on; the description makes the pair one fact for anything that
                   * exposes it (design-interaction, 2026-09-06). The visual disabled state
                   * stays the system's — `CONTROL_DISABLED_CLASS` keys off `:disabled`.
                   */
                  aria-describedby={blocked ? "library-stage-compile-blocked" : undefined}
                  /*
                   * **The indigo is on the badge, not on this button.** Which step is
                   * next changes with the folder, so the emphasis belongs to the thing
                   * that says so; a permanently indigo Compile would claim to be the
                   * primary action in a folder with nothing to compile. Hierarchy here
                   * is one ink step above its siblings, and the hover comes from the
                   * value layer's own axes rather than a hand-written pair.
                   */
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
                {!inApp ? (
                  /*
                   * A **chip**, not a link. `shape: "link"` is excluded from the coarse
                   * 44px floor because it ends a sentence, and the index's own copy of
                   * this destination does exactly that. Here it stands alone in an
                   * action row beside a button, where the exclusion would leave a ~25px
                   * target on a coarse 1024px tablet (design-responsive, 2026-09-06).
                   */
                  <Link
                    href="/download"
                    data-testid="library-stage-get-app"
                    className={controlClass({
                      shape: "chip",
                      tone: "muted",
                      hoverInk: "strong",
                    })}
                  >
                    {t("wiki.compileWebGetApp")}
                  </Link>
                ) : null}
              </div>
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
          </Step>

          <Step
            index={3}
            testId="library-stage-read"
            lead={leadIndex === 2}
            title={t("stage.read.title")}
            body={t("stage.read.body")}
            state={readState}
            t={t}
            facts={[
              {
                key: "pages",
                label: t("stage.read.pagesLabel"),
                value: String(model.wikiPages.length),
              },
              {
                key: "covered",
                label: t("stage.read.coveredLabel"),
                value: t("stage.read.coveredValue", {
                  compiled: compiledCount,
                  total: sourceCount,
                }),
              },
              {
                key: "offTemplate",
                label: t("stage.read.offTemplateLabel"),
                value: String(model.offTemplateCount),
              },
            ]}
          >
            {newest ? (
              <button
                type="button"
                onClick={() => onOpenWiki(newest.slug)}
                data-testid="library-stage-start-with"
                className={controlClass({ shape: "chip", tone: "muted", className: "max-w-full gap-1.5" })}
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
            )}
          </Step>
        </div>
      </div>
    </div>
  );
}
