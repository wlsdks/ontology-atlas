"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
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
    agentFiles: string;
    agentPlan: string;
    agentEvidence: string;
    agentSource: string;
    agentUpdated: string;
    agentMcp: string;
    agentCodegraph: string;
    agentVerification: string;
    statePlanning: string;
    stateEditing: string;
    stateVerifying: string;
    stateBlocked: string;
    stateComplete: string;
  };
  trackingChanges?: boolean;
}) {
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
    ? `${heartbeat.agent.toUpperCase()} · ${stateLabel}`
    : null;
  const triggerFocusLabel = heartbeat?.focus.summary ?? null;
  const evidenceCounts = heartbeat
    ? [
        [labels.agentMcp, heartbeat.evidence.mcp.length],
        [labels.agentCodegraph, heartbeat.evidence.codegraph.length],
        [labels.agentVerification, heartbeat.evidence.verification.length],
      ] as const
    : [];
  const evidenceCount = evidenceCounts.reduce((total, [, count]) => total + count, 0);
  const updatedLabel =
    heartbeat && agentActivityStatus?.ageMs !== undefined && agentActivityStatus.ageMs !== null
      ? labels.agentUpdated.replace("{age}", formatActivityAge(agentActivityStatus.ageMs))
      : null;
  const ariaLabel = [
    labels.triggerTitle,
    active ? labels.changedTitle : null,
    triggerAgentLabel,
  ].filter(Boolean).join(" — ");

  return (
    <details className="group relative shrink-0" data-testid="live-activity-badge">
      <summary
        role="button"
        title={ariaLabel}
        aria-label={ariaLabel}
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.48)] hover:bg-[color:rgba(94,106,210,0.14)] [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-success)]" />
        <span className="font-mono uppercase tracking-[0.10em]">{labels.live}</span>
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
          className="text-[color:var(--color-text-tertiary)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
          {labels.summaryTitle}
        </p>
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
              {updatedLabel ? (
                <p className="break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {updatedLabel}
                </p>
              ) : null}
              {heartbeat.focus.ontologySlug ? (
                <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                  {labels.agentSlug} {heartbeat.focus.ontologySlug}
                </p>
              ) : null}
              {visibleFiles.length > 0 ? (
                <p className="break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                  {labels.agentFiles} {visibleFiles.join(", ")}
                  {hiddenFileCount > 0 ? ` +${hiddenFileCount}` : ""}
                </p>
              ) : null}
              {heartbeat.plan[0] ? (
                <p className="break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {labels.agentPlan} {heartbeat.plan[0]}
                </p>
              ) : null}
              {evidenceCount > 0 ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
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
        agentFiles: t("agentFiles"),
        agentPlan: t("agentPlan"),
        agentEvidence: t("agentEvidence"),
        agentSource: t("agentSource"),
        agentUpdated: t("agentUpdated", { age: "{age}" }),
        agentMcp: t("agentMcp"),
        agentCodegraph: t("agentCodegraph"),
        agentVerification: t("agentVerification"),
        statePlanning: t("statePlanning"),
        stateEditing: t("stateEditing"),
        stateVerifying: t("stateVerifying"),
        stateBlocked: t("stateBlocked"),
        stateComplete: t("stateComplete"),
      }}
    />
  );
}
