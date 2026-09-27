"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { VendorMark } from "@/shared/ui/vendor-mark";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
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
 * The first steps after a folder opens, one at a time with an explanation. It blocks nothing (every
 * step can be skipped, the last one ends the card), a press counts as progress, and the explanation
 * area holds three lines so height does not jump.
 */

export type StartStepId = "docs" | "agent" | "analyze" | "starter" | "manual";

export interface VaultStartStepsProps {
  /** Whether an agent heartbeat is connected (HomePage's `useAgentConnectLauncher` state). */
  agentConnected?: boolean;
  /** A runner usable on this machine now, or null; shown here rather than only in settings. */
  acpRuntimeLabel?: string | null;
  /** Bundled mark for that tool (`/acp-icons/<id>.svg`), so the step shows it rather than only naming it. */
  acpRuntimeIcon?: string | null;
  /** The vendor's published brand colour for that mark, when there is one. */
  acpRuntimeInk?: string | null;
  /** The door that opens a conversation (when a runner exists), or the screen for picking a tool (when none does). */
  onOpenAgentConnect?: (() => void) | null;
  /**
   * Drops the analysis instruction into the agent's compose field, supplied only when a runner
   * exists.
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
  /** Source files the folder walk passed over; decides which step opens. */
  sourceFileCount?: number;
  onStartFromDocs?: (() => void) | null;
  /** The last step has been passed — dismiss the card. */
  onFinish?: () => void;
  /**
   * Whether INDEX is expanded. It floats over the map column, so it is left out of the centring.
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
  sourceFileCount = 0,
  onStartFromDocs = null,
  onFinish,
  indexExpanded = false,
}: VaultStartStepsProps) {
  const t = useTranslations("topology.startSteps");
  const kindLabel = useOntologyKindLabel();
  const { state: copyState, copy: copyPrompt } = useCopyFeedback();
  const [index, setIndex] = useState(0);
  /** Steps the user actually took; a press counts without waiting for the world to change. */
  const [acted, setActed] = useState<ReadonlySet<StartStepId>>(new Set());

  const agentReady = agentConnected || acpRuntimeLabel !== null;
  const hasDocs = docsFoundCount > 0 && onStartFromDocs !== null;

  /**
   * Codebase versus documents by plain comparison; a misread costs one Skip, since the steps are a
   * sequence.
   */
  const codeDominant = sourceFileCount > docsFoundCount;

  /**
   * Step order from what the folder holds: `analyze` leads for a codebase
   * (`docs/audits/USER-WALKTHROUGH-FIRST-RUN-2026-08-31.md`, finding 3). It may lead without an
   * agent because it degrades to a paste instruction.
   */
  const steps = useMemo<StartStepId[]>(
    () =>
      codeDominant
        ? [
            "analyze",
            "agent",
            ...(hasDocs ? (["docs"] as StartStepId[]) : []),
            onScaffoldStarter ? "starter" : "manual",
          ]
        : [
            ...(hasDocs ? (["docs"] as StartStepId[]) : []),
            "agent",
            "analyze",
            onScaffoldStarter ? "starter" : "manual",
          ],
    [codeDominant, hasDocs, onScaffoldStarter],
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

  /** A done step's secondary button says Next, not Skip. */
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

  /** The primary action names what it does, and pressing it advances. */
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
         * Connecting lives in one place, the settings Agents pane, whatever was detected, so the
         * name and the action agree.
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
        // A copy can fail on clipboard permission; failure is reported and does not advance.
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
         * The one step that does not advance, so the person sees Copied before leaving; the
         * secondary button becomes Next.
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
      /* Centred in the window, not in what is left of it; INDEX may pass beneath the left edge. */
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4"
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
        {/* The title is the step's title; progress sits beside it. */}
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
         * The explanation area is fixed at three lines (`min-h-15`, 60px) so the card does not jump
         * between steps.
         */}
        <p
          data-testid="start-step-body"
          className="mt-2 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]"
        >
          {body}
        </p>
        {/*
         * The found tool gets its own row with the same `VendorMark` as the agent settings list.
         */}
        {/*
         * Shows the four kind marks the map will draw (`OntologyMapKindGlyph`) instead of
         * describing the prompt.
         */}
        {current === "analyze" ? (
          <ul
            data-testid="start-step-kind-preview"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
          >
            {(["project", "domain", "capability", "element"] as const).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <OntologyMapKindGlyph kind={kind} size={13} />
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
            /* No box: the mark carries its own plate (`static-card-adoption-ratchet`). */
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
            {/* Every step has a skip; the card blocks nothing. */}
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
             * One indigo fill per screen, on the current primary. The hover is hand-written because
             * the value layer's `hoverSurface` has only the neutral `lift` step.
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
