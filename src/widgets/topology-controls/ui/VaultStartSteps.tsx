"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { VendorMark } from "@/shared/ui/vendor-mark";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import {
  Cable,
  CircleAlert,
  ClipboardCopy,
  Map as MapIcon,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip } from "@/shared/ui";

/**
 * The **first three steps** right after a folder is opened — one at a time, each with
 * an explanation.
 *
 * ## Why the checklist was abandoned (owner report from real use, 2026-08-16)
 *
 * It used to be a three-row checklist. With all three on screen at once, each row
 * could hold only **a one-line title**, and this is what the owner actually hit:
 *
 * - *"I can't even tell what the second one is."* (I can't even tell what the second one is) — 「Have AI read this code and draw a map draft」 is a title, not an explanation. What
 *   happens, what gets written into my folder, and whether approval is needed were
 *   nowhere.
 * - *"Copying doesn't even tick it off."* (copying doesn't even tick it off) — completion was
 *   decided by **the relation count**. The user pressed what they were told to and
 *   the screen behaved as though nothing had happened. A progress indicator that does
 *   not count a press is not a progress indicator.
 * - *"Create it for me."* (create it for me) — the button's name never said **what** it creates.
 * - *"The first one should be usable without connecting an agent, so it needs a skip button."* (the first one
 *   should be usable without connecting an agent, so it needs a skip button) — right.
 *   Step one is an invitation, not a gate, and the checklist had no door to pass through.
 *
 * So it became **one step at a time**. A step that owns the screen has room to
 * explain, and 「Next」 (next) plus 「Skip」 (skip) create a way past.
 *
 * ## What it holds to
 *
 * - **It blocks nothing.** Every step has a skip, and passing the last one ends the card.
 * - **A press is progress.** It does not wait for the world to change; if the user did
 *   that step, it moves on.
 * - **Height does not jump between steps.** The explanation area is reserved at three
 *   lines — this repository's discipline that dimensions are ours to decide, not the
 *   content's.
 */

export type StartStepId = "docs" | "agent" | "analyze" | "starter" | "manual";

export interface VaultStartStepsProps {
  /** Whether an agent heartbeat is connected (HomePage's `useAgentConnectLauncher` state). */
  agentConnected?: boolean;
  /**
   * The name of a runner **immediately usable** on this machine (null if none).
   * Hiding a fact the app already knows inside settings makes that fact exist only
   * for whoever went looking.
   */
  acpRuntimeLabel?: string | null;
  /** Bundled mark for that tool (`/acp-icons/<id>.svg`), so the step shows it rather than only naming it. */
  acpRuntimeIcon?: string | null;
  /** The vendor's published brand colour for that mark, when there is one. */
  acpRuntimeInk?: string | null;
  /** The door that opens a conversation (when a runner exists), or the screen for picking a tool (when none does). */
  onOpenAgentConnect?: (() => void) | null;
  /**
   * **Drop the analysis instruction into the agent's compose field** — supplied only
   * when a runner exists. With it, nobody is made to copy and paste: the place to
   * paste is inside this app.
   */
  onSendAnalyzeToAgent?: (() => void) | null;
  /** The instruction text — a copy for people whose paste target is outside. */
  analyzePrompt: string;
  /** Create skeleton documents plus the connection config in an empty folder. null when documents already exist. */
  onScaffoldStarter?: (() => void) | null;
  scaffolding?: boolean;
  /** The alternative — create the first node by hand. */
  onCreateNode: (kind: "project" | "domain") => void;
  /** How many documents were found in this folder that are not yet on the map. Above 0, a step is added. */
  docsFoundCount?: number;
  onStartFromDocs?: (() => void) | null;
  /** The last step has been passed — dismiss the card. */
  onFinish?: () => void;
  /**
   * Whether the INDEX panel is expanded. INDEX **floats over** the map column (the
   * right panel is a flex sibling and really does shrink the column), so it alone is
   * excluded from the centring calculation.
   */
  indexExpanded?: boolean;
}

export function VaultStartSteps({
  agentConnected = false,
  acpRuntimeLabel = null,
  acpRuntimeIcon = null,
  acpRuntimeInk = null,
  onOpenAgentConnect = null,
  onSendAnalyzeToAgent = null,
  analyzePrompt,
  onScaffoldStarter = null,
  scaffolding = false,
  onCreateNode,
  docsFoundCount = 0,
  onStartFromDocs = null,
  onFinish,
  indexExpanded = false,
}: VaultStartStepsProps) {
  const t = useTranslations("topology.startSteps");
  const kindLabel = useOntologyKindLabel();
  const { state: copyState, copy: copyPrompt } = useCopyFeedback();
  const [index, setIndex] = useState(0);
  /**
   * The steps the user **actually took**. Deciding by waiting for the world to change
   * creates the moment where they pressed what they were told to and the screen sat
   * still (owner: *"Copying doesn't even tick it off."* — copying doesn't even tick it off). A
   * press counts as a press.
   */
  const [acted, setActed] = useState<ReadonlySet<StartStepId>>(new Set());

  const agentReady = agentConnected || acpRuntimeLabel !== null;
  const hasDocs = docsFoundCount > 0 && onStartFromDocs !== null;

  /**
   * The **order** of the steps. With documents present, that is the first step — an
   * empty folder's priority (connecting an agent) was the order for an empty folder's
   * context, and for someone who already has something, the first step is what they have.
   */
  const steps = useMemo<StartStepId[]>(
    () => [
      ...(hasDocs ? (["docs"] as StartStepId[]) : []),
      "agent",
      "analyze",
      onScaffoldStarter ? "starter" : "manual",
    ],
    [hasDocs, onScaffoldStarter],
  );

  const current = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  /** Move on. Passing the last one means this card has done its job. */
  const advance = () => {
    if (isLast) {
      onFinish?.();
      return;
    }
    setIndex((i) => i + 1);
  };

  /**
   * Is this step **already done** — then the secondary button is 「Next」 (next), not
   * 「Skip」 (skip). "Skip" is the word for leaving something undone behind, so
   * using it on a step already taken erases what was just done.
   */
  const currentDone = current === "agent" ? agentReady : acted.has(current);

  const body =
    current === "docs"
      ? t("docs.body", { count: docsFoundCount })
      : current === "agent"
        ? acpRuntimeLabel
          ? t("agent.bodyFound", { runtime: acpRuntimeLabel })
          : t("agent.bodyMissing")
        : current === "analyze"
          ? onSendAnalyzeToAgent
            ? t("analyze.bodyAgent")
            : t("analyze.bodyCopy")
          : current === "starter"
            ? t("starter.body")
            : t("manual.body");

  const title =
    current === "docs"
      ? t("docs.title")
      : current === "agent"
        ? t("agent.title")
        : current === "analyze"
          ? t("analyze.title")
          : current === "starter"
            ? t("starter.title")
            : t("manual.title");

  /**
   * The primary action — its name states **what will happen when pressed**. And
   * pressing it moves to the next step: if the user did that step and the screen sat
   * still, that is the owner's *"Copying doesn't even tick it off."* (copying doesn't even
   * tick it off).
   */
  const primary = (() => {
    if (current === "docs") {
      return {
        label: t("docs.cta"),
        icon: <MapIcon size={ICON_SIZE.sm} aria-hidden />,
        testId: "start-step-cta-docs",
        disabled: false,
        run: () => {
          onStartFromDocs?.();
          advance();
        },
      };
    }
    if (current === "agent") {
      return {
        /*
         * This step's name is **connect**, and connecting lives in exactly one place,
         * the settings' Agents pane — where you see what was detected and choose what
         * to use (owner report, 2026-08-16). It does **not** send you somewhere else
         * depending on whether something was detected: with a name of 「Connect」 (connect),
         * opening a conversation makes the name and the action disagree.
         */
        label: t("agent.cta"),
        icon: <Cable size={ICON_SIZE.sm} aria-hidden />,
        testId: "start-step-cta-agent",
        disabled: onOpenAgentConnect === null,
        run: () => {
          onOpenAgentConnect?.();
          advance();
        },
      };
    }
    if (current === "analyze") {
      if (onSendAnalyzeToAgent) {
        return {
          label: t("analyze.ctaAgent"),
          icon: <MessageSquare size={ICON_SIZE.sm} aria-hidden />,
          testId: "start-step-cta-analyze",
          disabled: false,
          run: () => {
            onSendAnalyzeToAgent();
            advance();
          },
        };
      }
      return {
        // A copy **can fail** (clipboard permission). Silence reads as success, so the
        // button reports failure too — and on failure it does not advance.
        label:
          copyState === "failed"
            ? t("analyze.ctaFailed")
            : copyState === "copied"
              ? t("analyze.ctaCopied")
              : t("analyze.ctaCopy"),
        icon:
          copyState === "failed" ? (
            <CircleAlert size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
          ),
        testId: "start-step-cta-analyze",
        disabled: false,
        /*
         * This is the only step that **does not advance.** Whoever copied has to leave
         * this app and paste into another tool, so they need a beat to see 「Copied」
         * (copied). Instead, the secondary button below changes from 「Skip」 (skip)
         * to 「Next」 (next).
         */
        run: () => {
          void copyPrompt(analyzePrompt).then((ok) => {
            if (ok) setActed((prev) => new Set(prev).add("analyze"));
          });
        },
      };
    }
    if (current === "starter") {
      return {
        label: scaffolding ? t("starter.ctaBusy") : t("starter.cta"),
        icon: <Sparkles size={ICON_SIZE.sm} aria-hidden />,
        testId: "start-step-cta-starter",
        disabled: scaffolding,
        run: () => {
          onScaffoldStarter?.();
          advance();
        },
      };
    }
    return {
      label: t("manual.cta"),
      icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
      testId: "start-step-cta-manual",
      disabled: false,
      run: () => {
        onCreateNode("project");
        advance();
      },
    };
  })();

  return (
    <div
      data-index-reserved={indexExpanded ? "true" : "false"}
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4${
        indexExpanded
          ? " md:pl-[calc(var(--topology-index-inset)+var(--topology-index-width)+1rem)]"
          : ""
      }`}
    >
      <div
        data-testid="vault-start-steps"
        data-step={current}
        data-step-index={index}
        data-step-total={steps.length}
        data-agent-ready={agentReady ? "true" : "false"}
        role="status"
        aria-label={t("title")}
        aria-live="polite"
        className="pointer-events-auto w-[min(480px,calc(100vw-2rem))] rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[var(--shadow-elevation-1)]"
      >
        {/*
          The title **is the step's title**. There used to be a card title
          (「Getting Started Checklist」 — the getting-started checklist) and a row title separately,
          so the eye split between the two. This card now says exactly one thing, so it
          has one title. Progress is incidental to it, so it sits beside it.
        */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 break-keep text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {title}
          </h2>
          <span
            data-testid="start-step-progress"
            className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {t("progress", { current: index + 1, total: steps.length })}
          </span>
        </div>
        {/*
          The explanation area is **fixed at three lines**. Copy is short in some steps
          and long in others, so left alone the card jumps up and down step by step —
          and on a screen where only the content changes in the same place, that wobble
          reads as 「a different card arrived」.

          `min-h-15` = 60px = three 20px lines. It used to be written as
          `calc(3*var(--leading-body))`, but **indirectly referencing a ramp token as a
          length inside brackets** is a shape this repository forbids (review
          2026-08-16). The value is identical to the pixel.
        */}
        <p
          data-testid="start-step-body"
          className="mt-2 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]"
        >
          {body}
        </p>
        {/*
          ⚠️ **Name the tool with its own mark** (owner, 2026-08-25: *"if something was found, can it
          not be shown properly — the box can be bigger — with the Claude mark, like the agent tab?"*).
          The step said "found an AI tool you can use: Claude Agent" and buried the one concrete
          finding at the end of a sentence. A found tool is the whole point of this step, so it gets a
          row of its own with the vendor's drawing beside its name — the same `VendorMark` the agent
          settings list uses, so the two cannot drift.
        */}
        {/*
          ⚠️ **Show the shapes instead of describing the prompt** (owner, 2026-08-25: *"why does it
          say what is in the instruction here? just compose it nicely — put something in, a map shape
          or an example, something simple"*).
          
          The step used to spend its second sentence on what our prompt contains, which is an
          implementation detail of our prompt engineering, not something the person is deciding. What
          they are about to see is a map made of four marks, so the card shows those marks — the same
          `TopologyV2KindGlyph` the map draws, so this is a preview rather than an illustration, and
          it teaches the four names they will meet in the files.
        */}
        {current === "analyze" ? (
          <ul
            data-testid="start-step-kind-preview"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
          >
            {(["project", "domain", "capability", "element"] as const).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <TopologyV2KindGlyph kind={kind} size={13} />
                <span className="text-label leading-label text-[color:var(--color-text-quaternary)]">
                  {kindLabel(kind)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {current === "agent" && acpRuntimeLabel ? (
          <div
            data-testid="start-step-runtime"
            /*
             * No box. A bordered plate here would be a third rectangle inside this card, and the
             * `static-card-adoption-ratchet` caught it on the first try — the ledger exists because
             * 71 hand-written boxes once grew into 51 distinct combinations. The mark already carries
             * its own plate, which is enough to separate the tool from the sentence above it.
             */
            className="mt-3 flex items-center gap-2.5"
          >
            <VendorMark src={acpRuntimeIcon} ink={acpRuntimeInk} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {acpRuntimeLabel}
              </span>
              <span className="block truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                {t("agent.runtimeReady")}
              </span>
            </span>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          {/* The way back — the first step has nowhere to go, so it only holds the space. */}
          {index > 0 ? (
            <Chip
              size="md"
              tone="secondary"
              hoverInk="strong"
              hoverSurface="lift"
              data-testid="start-step-back"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              {t("back")}
            </Chip>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-2">
            {/*
              **Every step has a skip.** Step one (connecting an agent) is an invitation
              rather than a gate, and so are the rest — this card must block nothing
              (owner: *"It has to be usable without connecting an agent"* — it has to be usable
              without connecting an agent).
            */}
            <Chip
              size="md"
              tone="secondary"
              hoverInk="strong"
              hoverSurface="lift"
              data-testid="start-step-skip"
              onClick={advance}
            >
              {currentDone ? t("next") : t("skip")}
            </Chip>
            {/*
              Fill is **one per screen** — the only thing with an indigo surface on this
              card is the current step's primary action.

              Why the hover is hand-written: the value layer's `hoverSurface` axis has
              only the one neutral `lift` step. Raising an indigo tint by a step is not
              a value but **a hierarchy decision**, which the axis deliberately does not
              carry (the inventory found no majority) — so it stays here, with its
              rationale recorded here.
            */}
            <Chip
              size="lg"
              tone="accentOnTint"
              data-testid={primary.testId}
              disabled={primary.disabled}
              onClick={primary.run}
              className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)]"
            >
              {primary.icon}
              {primary.label}
            </Chip>
          </span>
        </div>
      </div>
    </div>
  );
}
