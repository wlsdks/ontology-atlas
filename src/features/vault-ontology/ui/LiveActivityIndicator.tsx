"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Clipboard, X } from "lucide-react";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { DEFAULT_BUSINESS_ONTOLOGY_LENS } from "@/shared/lib/business-ontology-lens";
import {
  buildAgentGraphDbQueryPack,
  computeOntologyChangeset,
  formatAgentBusinessQuestionHandoff,
  type AgentBusinessQuestionFocus,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useOntologyInsight } from "../model/use-ontology-insight";

type LiveAgentActivityState =
  | "planning"
  | "editing"
  | "verifying"
  | "blocked"
  | "complete";

interface LiveAgentActivityStatus {
  sourcePath?: string;
  exists: boolean;
  valid: boolean;
  stale: boolean;
  ageMs?: number | null;
  reviewMode?: "none" | "ontology-focus" | "business-extraction";
  heartbeat: {
    agent: string;
    state: LiveAgentActivityState;
    focus: {
      summary: string | null;
      ontologySlug: string | null;
      files: string[];
    };
    plan: string[];
    evidence: {
      mcp: string[];
      codegraph: string[];
      verification: string[];
    };
    updatedAt: string;
  } | null;
  errorMessage: string | null;
}

/**
 * live-web — 상시 ambient "Live" indicator (operations-nav).
 *
 * baseline 이 잡혀 있으면(=live 추적 중) 항상 "LIVE" 를 표시하고, 그 이후
 * 변경된 노드 수를 옆에 단다. transient toast 와 달리 사라지지 않아 "지금
 * 에이전트 작업이 화면에 추적되고 있다" 를 항상 인지하게 한다. baseline 없으면
 * (static/데모 또는 미추적) 아무것도 안 보임.
 *
 * 디자인 헌장 준수: 무채색 + 인디고 pill, 신호용 green dot(status-success).
 * glow/neon/scale 없음 — 정적 dot.
 */
export function LiveActivityBadge({
  changedCount,
  agentActivityStatus,
  labels,
  trackingChanges = true,
}: {
  changedCount: number;
  agentActivityStatus?: LiveAgentActivityStatus;
  labels: {
    live: string;
    triggerTitle: string;
    changedCountLabel: string;
    changedTitle: string;
    summaryTitle: string;
    summaryBody: string;
    summaryZero: string;
    summaryCount: string;
    summaryNotTracking: string;
    summaryAction: string;
    agentTitle: string;
    agentMissing: string;
    agentInvalid: string;
    agentStale: string;
    agentCurrent: string;
    agentFocusFallback: string;
    agentSlug: string;
    agentFocusAction: string;
    agentFocusCopy: string;
    agentFocusCopied: string;
    agentFocusCopyFailed: string;
    agentExtractCopy: string;
    agentExtractCopied: string;
    agentExtractCopyFailed: string;
    agentFiles: string;
    agentPlan: string;
    agentEvidence: string;
    agentSource: string;
    agentReviewMode: string;
    agentReviewOntologyFocus: string;
    agentReviewBusinessExtraction: string;
    agentUpdated: string;
    agentChipTracking: string;
    agentChipMissing: string;
    agentChipInvalid: string;
    agentChipStale: string;
    agentChipCurrent: string;
    agentProofChip: string;
    agentMcp: string;
    agentCodegraph: string;
    agentVerification: string;
    agentProofTrail: string;
    close: string;
    statePlanning: string;
    stateEditing: string;
    stateVerifying: string;
    stateBlocked: string;
    stateComplete: string;
  };
  trackingChanges?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { state: focusCopyState, copy: copyFocusCheck } = useCopyFeedback(1500);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const active = changedCount > 0;
  const heartbeat = agentActivityStatus?.heartbeat ?? null;
  const stateLabel = heartbeat
    ? {
        planning: labels.statePlanning,
        editing: labels.stateEditing,
        verifying: labels.stateVerifying,
        blocked: labels.stateBlocked,
        complete: labels.stateComplete,
      }[heartbeat.state]
    : null;
  const visibleFiles = heartbeat?.focus.files.slice(0, 2) ?? [];
  const hiddenFileCount = Math.max(0, (heartbeat?.focus.files.length ?? 0) - visibleFiles.length);
  const triggerAgentLabel = heartbeat && stateLabel
    ? `${heartbeat.agent.toUpperCase()} · ${
        agentActivityStatus?.stale ? labels.agentStale : stateLabel
      }`
    : null;
  const triggerFocusLabel = heartbeat?.focus.summary ?? heartbeat?.focus.ontologySlug ?? null;
  const focusHref = heartbeat?.focus.ontologySlug
    ? buildOntologyNodeHref(heartbeat.focus.ontologySlug)
    : null;
  const focusCheckPacket = heartbeat?.focus.ontologySlug
    ? formatLiveAgentFocusCheckPacket({
        slug: heartbeat.focus.ontologySlug,
        summary: heartbeat.focus.summary,
        files: heartbeat.focus.files,
      })
    : null;
  const businessExtractionPacket =
    heartbeat &&
    (agentActivityStatus?.reviewMode === "business-extraction" ||
      (!agentActivityStatus?.reviewMode &&
        !heartbeat.focus.ontologySlug &&
        heartbeat.focus.files.length > 0))
      ? formatLiveAgentBusinessExtractionPacket({
          files: heartbeat.focus.files,
          summary: heartbeat.focus.summary,
        })
      : null;
  const focusCopyLabel =
    focusCopyState === "copied"
      ? labels.agentFocusCopied
      : focusCopyState === "failed"
        ? labels.agentFocusCopyFailed
        : labels.agentFocusCopy;
  const businessExtractionCopyLabel =
    focusCopyState === "copied"
      ? labels.agentExtractCopied
      : focusCopyState === "failed"
        ? labels.agentExtractCopyFailed
        : labels.agentExtractCopy;
  const evidenceCounts = heartbeat
    ? [
        [labels.agentMcp, heartbeat.evidence.mcp.length],
        [labels.agentCodegraph, heartbeat.evidence.codegraph.length],
        [labels.agentVerification, heartbeat.evidence.verification.length],
      ] as const
    : [];
  const evidenceTrail = heartbeat
    ? [
        [labels.agentMcp, heartbeat.evidence.mcp] as const,
        [labels.agentCodegraph, heartbeat.evidence.codegraph] as const,
        [labels.agentVerification, heartbeat.evidence.verification] as const,
      ].flatMap(([label, items]) =>
        items[0]
          ? [
              {
                label,
                first: items[0],
                hiddenCount: Math.max(0, items.length - 1),
              },
            ]
          : [],
      )
    : [];
  const evidenceCount = evidenceCounts.reduce((total, [, count]) => total + count, 0);
  const evidenceCountTitle = evidenceCounts.some(([, count]) => count > 0)
    ? `${labels.agentEvidence}: ${evidenceCounts
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${label} · ${count}`)
        .join(", ")}`
    : null;
  const agentStateChip = !agentActivityStatus?.exists
    ? trackingChanges
      ? labels.agentChipTracking
      : labels.agentChipMissing
    : !agentActivityStatus.valid
      ? labels.agentChipInvalid
      : agentActivityStatus.stale
        ? labels.agentChipStale
        : heartbeat
          ? labels.agentChipCurrent
          : labels.agentChipMissing;
  const updatedLabel =
    heartbeat && agentActivityStatus?.ageMs !== undefined && agentActivityStatus.ageMs !== null
      ? labels.agentUpdated.replace("{age}", formatActivityAge(agentActivityStatus.ageMs))
      : null;
  const reviewMode = visibleAgentReviewMode(agentActivityStatus?.reviewMode, heartbeat);
  const reviewModeChip = reviewMode === "ontology-focus"
    ? labels.agentReviewOntologyFocus
    : reviewMode === "business-extraction"
      ? labels.agentReviewBusinessExtraction
      : null;
  const ariaLabel = [
    labels.triggerTitle,
    active ? labels.changedTitle : null,
    triggerAgentLabel,
    reviewMode,
    triggerFocusLabel,
  ].filter(Boolean).join(" — ");

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid="live-activity-badge">
      <button
        type="button"
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-controls={open ? popoverId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.48)] hover:bg-[color:rgba(94,106,210,0.14)]"
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-success)]" />
        <span className="font-mono uppercase tracking-[0.10em]">{labels.live}</span>
        <span
          className="rounded border border-[color:rgba(139,151,255,0.24)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
          data-testid="live-agent-state-chip"
        >
          {agentStateChip}
        </span>
        {reviewModeChip ? (
          <span
            className="hidden rounded border border-[color:rgba(139,151,255,0.24)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] md:inline"
            data-testid="live-agent-review-chip"
          >
            {reviewModeChip}
          </span>
        ) : null}
        {evidenceCount > 0 ? (
          <span
            className="hidden rounded border border-[color:rgba(139,151,255,0.24)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] lg:inline"
            data-testid="live-agent-proof-chip"
            aria-label={evidenceCountTitle ?? undefined}
            title={evidenceCountTitle ?? undefined}
          >
            {labels.agentProofChip.replace("{count}", String(evidenceCount))}
          </span>
        ) : null}
        {active ? (
          <span className="font-mono tabular-nums" data-testid="live-activity-count">
            · {labels.changedCountLabel}
          </span>
        ) : null}
        {triggerAgentLabel ? (
          <span className="hidden max-w-[8.5rem] truncate border-l border-[color:rgba(139,151,255,0.28)] pl-1.5 font-mono uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)] sm:inline">
            {triggerAgentLabel}
          </span>
        ) : null}
        {triggerFocusLabel ? (
          <span className="hidden max-w-[12rem] truncate text-[color:var(--color-text-tertiary)] xl:inline">
            {triggerFocusLabel}
          </span>
        ) : null}
        <ChevronDown
          size={11}
          aria-hidden
          className={open
            ? "rotate-180 text-[color:var(--color-text-tertiary)] transition-transform"
            : "text-[color:var(--color-text-tertiary)] transition-transform"}
        />
      </button>
      {open ? (
      <div
        id={popoverId}
        role="dialog"
        aria-label={labels.summaryTitle}
        className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
            {labels.summaryTitle}
          </p>
          <button
            type="button"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
            className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-primary)]"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
        <p className="mt-2 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
          {labels.summaryBody}
        </p>
        <p className="mt-2 break-keep text-[11px] leading-4 text-[color:var(--color-text-primary)]">
          {trackingChanges
            ? active
              ? labels.summaryCount
              : labels.summaryZero
            : labels.summaryNotTracking}
        </p>
        <p className="mt-2 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
          {labels.summaryAction}
        </p>
        <div
          className="mt-3 border-t border-[color:var(--color-divider)] pt-3"
          data-testid="live-agent-activity"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.agentTitle}
          </p>
          {!agentActivityStatus?.exists ? (
            <p className="mt-2 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
              {labels.agentMissing}
            </p>
          ) : !agentActivityStatus.valid ? (
            <p className="mt-2 break-keep text-[11px] leading-4 text-[color:var(--color-status-danger)]">
              {labels.agentInvalid}
              {agentActivityStatus.errorMessage ? ` · ${agentActivityStatus.errorMessage}` : ""}
            </p>
          ) : heartbeat ? (
            <div className="mt-2 grid gap-2 text-[11px] leading-4">
              <p className={agentActivityStatus.stale ? "text-[color:rgba(238,198,128,0.95)]" : "text-[color:var(--color-text-primary)]"}>
                {agentActivityStatus.stale ? labels.agentStale : labels.agentCurrent}
                <span className="ml-1 font-mono uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)]">
                  {heartbeat.agent} · {stateLabel}
                </span>
              </p>
              <p className="break-keep text-[color:var(--color-text-secondary)]">
                {heartbeat.focus.summary ?? labels.agentFocusFallback}
              </p>
              {agentActivityStatus.sourcePath ? (
                <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                  {labels.agentSource} {agentActivityStatus.sourcePath}
                </p>
              ) : null}
              {reviewMode ? (
                <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                  {labels.agentReviewMode} {reviewMode}
                </p>
              ) : null}
              {updatedLabel ? (
                <p className="break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {updatedLabel}
                </p>
              ) : null}
              {heartbeat.focus.ontologySlug ? (
                <div className="grid gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5">
                  <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                    {labels.agentSlug} {heartbeat.focus.ontologySlug}
                  </p>
                  {focusHref ? (
                    <div className="flex flex-wrap gap-1.5">
                      <a
                        href={focusHref}
                        className="inline-flex w-fit items-center rounded border border-[color:rgba(139,151,255,0.26)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.46)] hover:bg-[color:rgba(94,106,210,0.10)]"
                      >
                        {labels.agentFocusAction}
                      </a>
                      {focusCheckPacket ? (
                        <button
                          type="button"
                          onClick={() => void copyFocusCheck(focusCheckPacket)}
                          className="inline-flex w-fit items-center gap-1 rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.38)] hover:text-[color:var(--color-text-primary)]"
                        >
                          <Clipboard size={10} aria-hidden />
                          {focusCopyLabel}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {visibleFiles.length > 0 ? (
                <div className="grid gap-1">
                  <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                    {labels.agentFiles} {visibleFiles.join(", ")}
                    {hiddenFileCount > 0 ? ` +${hiddenFileCount}` : ""}
                  </p>
                  {businessExtractionPacket ? (
                    <button
                      type="button"
                      onClick={() => void copyFocusCheck(businessExtractionPacket)}
                      className="inline-flex w-fit items-center gap-1 rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.38)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <Clipboard size={10} aria-hidden />
                      {businessExtractionCopyLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {heartbeat.plan[0] ? (
                <p className="break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {labels.agentPlan} {heartbeat.plan[0]}
                </p>
              ) : null}
              {evidenceCount > 0 ? (
                <>
                  <div
                    aria-label={labels.agentEvidence}
                    className="flex flex-wrap gap-1.5"
                  >
                    {evidenceCounts.map(([label, count]) =>
                      count > 0 ? (
                        <span
                          key={label}
                          className="rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
                        >
                          {label} · {count}
                        </span>
                      ) : null,
                    )}
                  </div>
                  <div
                    aria-label={labels.agentProofTrail}
                    className="grid gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {labels.agentProofTrail}
                    </p>
                    {evidenceTrail.map((item) => (
                      <p
                        key={item.label}
                        className="break-all text-[10px] leading-4 text-[color:var(--color-text-tertiary)]"
                      >
                        <span className="font-mono uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">
                          {item.label}
                        </span>{" "}
                        {item.first}
                        {item.hiddenCount > 0 ? ` +${item.hiddenCount}` : ""}
                      </p>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}

function visibleAgentReviewMode(
  reviewMode: LiveAgentActivityStatus["reviewMode"] | undefined,
  heartbeat: LiveAgentActivityStatus["heartbeat"],
): "ontology-focus" | "business-extraction" | null {
  if (reviewMode && reviewMode !== "none") return reviewMode;
  if (heartbeat?.focus.ontologySlug) return "ontology-focus";
  if (heartbeat?.focus.files.length) return "business-extraction";
  return null;
}

function formatActivityAge(ageMs: number): string {
  const safeAge = Math.max(0, ageMs);
  const seconds = Math.floor(safeAge / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatLiveAgentFocusCheckPacket({
  files,
  slug,
  summary,
}: {
  files: string[];
  slug: string;
  summary: string | null;
}): string {
  const fileLine = files[0]
    ? `- First file: ${files[0]}${files.length > 1 ? ` +${files.length - 1}` : ""}`
    : "- First file: not reported";
  const businessQuestionFocus = inferBusinessQuestionFocus(slug);
  const businessQuestionHandoff = formatAgentBusinessQuestionHandoff(
    buildAgentGraphDbQueryPack([
      {
        slug,
        title: summary?.trim() || slug,
        kind: inferOntologyKind(slug),
        degree: 0,
      },
    ]),
    businessQuestionFocus,
  );

  return [
    "# Live agent focus check",
    "",
    `- Focus slug: ${slug}`,
    `- Summary: ${summary?.trim() || "not reported"}`,
    fileLine,
    "",
    "## MCP checks",
    `1. query_ontology operation=node_profile slug=${slug} limit=8`,
    `2. query_ontology operation=reachability start=${slug} direction=both maxDepth=2 limit=12`,
    "3. query_ontology operation=health nodeLimit=8",
    "",
    businessQuestionHandoff,
    "",
    "## Review rule",
    "Do not accept path-only, API-only, or route-only evidence.",
    "Confirm the business/product claim, domain boundary, capability, and implementation proof rows before trusting the heartbeat.",
  ].join("\n");
}

function formatLiveAgentBusinessExtractionPacket({
  files,
  summary,
}: {
  files: string[];
  summary: string | null;
}): string {
  const fileLines = files.length > 0
    ? files.map((file) => `- ${file}`)
    : ["- not reported"];
  const questions = DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionQuestions.map(
    (question) => `- ${question}`,
  );
  const criteria = DEFAULT_BUSINESS_ONTOLOGY_LENS.decisionAnswerCriteria.map(
    (criterion) => `- ${criterion}`,
  );
  const guidance = DEFAULT_BUSINESS_ONTOLOGY_LENS.guidance.map((item) => `- ${item}`);

  return [
    "# Business ontology extraction handoff",
    "",
    `- Summary: ${summary?.trim() || "not reported"}`,
    "- Focus slug: not selected yet",
    "",
    "## Source files under review",
    ...fileLines,
    "",
    `Read order: ${DEFAULT_BUSINESS_ONTOLOGY_LENS.readOrder.join(" -> ")}`,
    ...guidance,
    "",
    "## Questions to answer before writing ontology",
    ...questions,
    "",
    "## Acceptance criteria",
    ...criteria,
    "- Reject path-only, API-only, route-only, or command-only answers as implementation notes, not business ontology evidence.",
    "",
    "## Required output",
    "- Proposed domain boundary: <business/product boundary, or unknown>",
    "- Capability claim: <planner/marketer/leader-readable claim, or unknown>",
    "- Implementation proof: <source file evidence mapped to element/proof rows>",
    "- Ontology write recommendation: <add/patch/skip, with reason>",
  ].join("\n");
}

function inferBusinessQuestionFocus(slug: string): AgentBusinessQuestionFocus {
  if (slug === "project") return "outcome";
  if (slug.startsWith("domains/")) return "boundary";
  if (slug.startsWith("elements/")) return "evidence";
  return "claim";
}

function inferOntologyKind(slug: string): string {
  if (slug === "project") return "project";
  if (slug.startsWith("domains/")) return "domain";
  if (slug.startsWith("elements/")) return "element";
  if (slug.startsWith("capabilities/")) return "capability";
  return "capability";
}

export function shouldShowLiveActivityIndicator(
  baseline: unknown,
  agentActivityStatus?: LiveAgentActivityStatus,
): boolean {
  return Boolean(baseline || agentActivityStatus?.exists);
}

export function LiveActivityIndicator({
  agentActivityStatus,
}: {
  agentActivityStatus?: LiveAgentActivityStatus;
} = {}) {
  const baseline = useChangeBaseline();
  const { insight } = useOntologyInsight();
  const t = useTranslations("liveActivity");
  const changedCount = useMemo(
    () =>
      baseline && insight
        ? computeOntologyChangeset(baseline, insight.nodes, insight.edges).touchedNodeIds.size
        : 0,
    [baseline, insight],
  );
  if (!shouldShowLiveActivityIndicator(baseline, agentActivityStatus)) return null;
  return (
    <LiveActivityBadge
      changedCount={changedCount}
      agentActivityStatus={agentActivityStatus}
      trackingChanges={Boolean(baseline)}
      labels={{
        live: t("live"),
        triggerTitle: t("triggerTitle"),
        changedCountLabel: t("changedCountLabel", { count: changedCount }),
        changedTitle: t("changed", { count: changedCount }),
        summaryTitle: t("summaryTitle"),
        summaryBody: t("summaryBody"),
        summaryZero: t("summaryZero"),
        summaryCount: t("summaryCount", { count: changedCount }),
        summaryNotTracking: t("summaryNotTracking"),
        summaryAction: t("summaryAction"),
        agentTitle: t("agentTitle"),
        agentMissing: t("agentMissing"),
        agentInvalid: t("agentInvalid"),
        agentStale: t("agentStale"),
        agentCurrent: t("agentCurrent"),
        agentFocusFallback: t("agentFocusFallback"),
        agentSlug: t("agentSlug"),
        agentFocusAction: t("agentFocusAction"),
        agentFocusCopy: t("agentFocusCopy"),
        agentFocusCopied: t("agentFocusCopied"),
        agentFocusCopyFailed: t("agentFocusCopyFailed"),
        agentExtractCopy: t("agentExtractCopy"),
        agentExtractCopied: t("agentExtractCopied"),
        agentExtractCopyFailed: t("agentExtractCopyFailed"),
        agentFiles: t("agentFiles"),
        agentPlan: t("agentPlan"),
        agentEvidence: t("agentEvidence"),
        agentSource: t("agentSource"),
        agentReviewMode: t("agentReviewMode"),
        agentReviewOntologyFocus: t("agentReviewOntologyFocus"),
        agentReviewBusinessExtraction: t("agentReviewBusinessExtraction"),
        agentUpdated: t("agentUpdated", { age: "{age}" }),
        agentChipTracking: t("agentChipTracking"),
        agentChipMissing: t("agentChipMissing"),
        agentChipInvalid: t("agentChipInvalid"),
        agentChipStale: t("agentChipStale"),
        agentChipCurrent: t("agentChipCurrent"),
        agentProofChip: t("agentProofChip", { count: "{count}" }),
        agentMcp: t("agentMcp"),
        agentCodegraph: t("agentCodegraph"),
        agentVerification: t("agentVerification"),
        agentProofTrail: t("agentProofTrail"),
        close: t("close"),
        statePlanning: t("statePlanning"),
        stateEditing: t("stateEditing"),
        stateVerifying: t("stateVerifying"),
        stateBlocked: t("stateBlocked"),
        stateComplete: t("stateComplete"),
      }}
    />
  );
}
