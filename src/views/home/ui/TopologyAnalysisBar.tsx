"use client";

import { useCallback, useState } from "react";
import { Activity, Check, Clipboard, GitBranch, HeartPulse, Network } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";
import type { TopologyAnalysisMode } from "../model/url-state";
import type {
  TopologyAnalysisSummary,
  TopologyHealthActionTarget,
} from "../lib/topology-analysis";
import {
  buildTopologyHealthRepairHref,
  formatTopologyFocusBrief,
  formatTopologyHealthBrief,
  formatTopologyHealthImpactMcpCheck,
  formatTopologyHealthMcpCheck,
  formatTopologyOverviewBrief,
  formatTopologyPathAllPathsMcpCheck,
  formatTopologyPathAllPathsPlanMcpCheck,
  formatTopologyPathEvidenceBrief,
  formatTopologyPathExplainRelationMcpCheck,
  formatTopologyPathMcpCheck,
  formatTopologyPathRelationPreflightMcpCheck,
  getTopologyHealthNextAction,
} from "../lib/topology-analysis";
import { copyText } from "@/shared/lib/copy-text";

interface TopologyAnalysisBarLabels {
  title: string;
  overview: string;
  focus: string;
  path: string;
  health: string;
  metricNodes: string;
  metricRelations: string;
  metricIssues: string;
  healthStale: string;
  healthOrphan: string;
  healthPromotion: string;
  healthInspect: string;
  healthCopy: string;
  healthRepair: string;
  healthCopied: string;
  healthMcpCopy: string;
  healthMcpCopied: string;
  healthMcpImpactCopy: string;
  healthMcpImpactCopied: string;
  healthSyncGateCopy: string;
  healthSyncGateCopied: string;
  healthRepairOrderTitle: string;
  healthRepairOrderInspect: string;
  healthRepairOrderRepair: string;
  healthRepairOrderSync: string;
  overviewBriefCopy: string;
  overviewBriefCopied: string;
  overviewWorkOrderTitle: string;
  overviewWorkOrderRead: string;
  overviewWorkOrderFocus: string;
  overviewWorkOrderPath: string;
  overviewWorkOrderHealth: string;
  overviewBriefCopyAriaLabel: string;
  overviewBriefCopiedAriaLabel: string;
  overviewBriefTitle: string;
  overviewBriefTotalNodes: string;
  overviewBriefTotalRelations: string;
  overviewBriefHealthSignals: string;
  overviewBriefHealthUrl: string;
  overviewBriefInsightsUrl: string;
  overviewBriefAgentCheck: string;
  overviewBriefMcpCheck: string;
  overviewBriefMcpQueryPlan: string;
  overviewBriefWorkspaceCheck: string;
  overviewBriefMcpWorkspaceCheck: string;
  focusBriefCopy: string;
  focusBriefCopied: string;
  focusMcpCopy: string;
  focusMcpCopied: string;
  focusMcpImpactCopy: string;
  focusMcpImpactCopied: string;
  focusSyncGateCopy: string;
  focusSyncGateCopied: string;
  focusOpenOntology: string;
  focusOpenBuilder: string;
  focusBriefCopyAriaLabel: string;
  focusBriefCopiedAriaLabel: string;
  focusMcpCopyAriaLabel: string;
  focusMcpCopiedAriaLabel: string;
  focusMcpImpactCopyAriaLabel: string;
  focusMcpImpactCopiedAriaLabel: string;
  focusSyncGateCopyAriaLabel: string;
  focusSyncGateCopiedAriaLabel: string;
  focusBriefTitle: string;
  focusBriefNode: string;
  focusBriefUrl: string;
  focusBriefOntologyUrl: string;
  focusBriefBuilderUrl: string;
  focusBriefReviewFocus: string;
  focusBriefAgentCheck: string;
  focusBriefMcpCheck: string;
  focusBriefImpactCheck: string;
  focusBriefMcpImpactCheck: string;
  focusBriefSyncGate: string;
  healthMcpCopyAriaLabel: string;
  healthMcpCopiedAriaLabel: string;
  healthMcpImpactCopyAriaLabel: string;
  healthMcpImpactCopiedAriaLabel: string;
  healthSyncGateCopyAriaLabel: string;
  healthSyncGateCopiedAriaLabel: string;
  healthCopyAriaLabel: string;
  healthCopiedAriaLabel: string;
  healthEvidenceTitle: string;
  healthEvidenceTotal: string;
  healthEvidenceInspectUrl: string;
  healthEvidenceRepairUrl: string;
  healthEvidenceNextAction: string;
  healthEvidenceAgentCheck: string;
  healthEvidenceMcpCheck: string;
  healthEvidenceRelationPreflight: string;
  healthEvidenceMcpRelationPreflight: string;
  healthEvidenceImpactCheck: string;
  healthEvidenceMcpImpactCheck: string;
  healthEvidenceSyncGate: string;
  healthEvidenceActionStale: string;
  healthEvidenceActionOrphan: string;
  healthEvidenceActionPromotion: string;
  healthEvidenceNone: string;
  healthEvidenceUrl: string;
  focusPrompt: string;
  focusSelected: string;
  pathPrompt: string;
  pathSelected: string;
  pathResolved: string;
  pathEvidenceCopy: string;
  pathEvidenceCopied: string;
  pathEvidenceCopyAriaLabel: string;
  pathEvidenceCopiedAriaLabel: string;
  pathMcpCopy: string;
  pathMcpCopied: string;
  pathMcpCopyAriaLabel: string;
  pathMcpCopiedAriaLabel: string;
  pathRelationPreflightCopy: string;
  pathRelationPreflightCopied: string;
  pathRelationPreflightCopyAriaLabel: string;
  pathRelationPreflightCopiedAriaLabel: string;
  pathExplainRelationCopy: string;
  pathExplainRelationCopied: string;
  pathExplainRelationCopyAriaLabel: string;
  pathExplainRelationCopiedAriaLabel: string;
  pathAllPathsPlanCopy: string;
  pathAllPathsPlanCopied: string;
  pathAllPathsPlanCopyAriaLabel: string;
  pathAllPathsPlanCopiedAriaLabel: string;
  pathAllPathsCopy: string;
  pathAllPathsCopied: string;
  pathAllPathsCopyAriaLabel: string;
  pathAllPathsCopiedAriaLabel: string;
  pathProofOrderTitle: string;
  pathProofOrderDesc: string;
  pathProofChecklist: string;
  pathProofVisiblePath: string;
  pathProofRelationPreflight: string;
  pathProofExplainRelation: string;
  pathProofBoundedTraversal: string;
  pathProofPostWriteSync: string;
  pathProofStatusReady: string;
  pathProofStatusRequired: string;
  pathProofStatusAfterWrite: string;
  pathEvidenceTitle: string;
  pathEvidenceSource: string;
  pathEvidenceTarget: string;
  pathEvidenceUrl: string;
  pathEvidenceSourceOntologyUrl: string;
  pathEvidenceTargetOntologyUrl: string;
  pathEvidenceSourceBuilderUrl: string;
  pathEvidenceTargetBuilderUrl: string;
  pathEvidenceCliCheck: string;
  pathEvidenceMcpCheck: string;
  pathEvidenceRelationPreflightReason: string;
  pathEvidenceRelationPreflightMcpCheck: string;
  pathEvidenceExplainRelationMcpCheck: string;
  pathEvidenceAllPathsPlanMcpCheck: string;
  pathEvidenceAllPathsMcpCheck: string;
  pathEvidenceAllPathsCopyInstruction: string;
  pathEvidencePostWriteSyncGate: string;
  pathSourceOntology: string;
  pathTargetOntology: string;
  pathSourceBuilder: string;
  pathTargetBuilder: string;
  healthPrompt: string;
  overviewPrompt: string;
}

interface TopologyAnalysisBarProps {
  mode: TopologyAnalysisMode;
  summary: TopologyAnalysisSummary;
  healthAction: TopologyHealthActionTarget | null;
  selectedSlug?: string | null;
  selectedTitle: string | null;
  pathSourceSlug?: string | null;
  pathTargetSlug?: string | null;
  pathSourceTitle?: string | null;
  pathTargetTitle?: string | null;
  rightPanelReserved?: boolean;
  labels: TopologyAnalysisBarLabels;
  onModeChange: (mode: TopologyAnalysisMode) => void;
  onHealthAction: (slug: string) => void;
}

const MODES = [
  { value: "overview", icon: Network, labelKey: "overview" },
  { value: "focus", icon: Activity, labelKey: "focus" },
  { value: "path", icon: GitBranch, labelKey: "path" },
  { value: "health", icon: HeartPulse, labelKey: "health" },
] as const;

export function TopologyAnalysisBar({
  mode,
  summary,
  healthAction,
  selectedSlug = null,
  selectedTitle,
  pathSourceSlug,
  pathTargetSlug,
  pathSourceTitle,
  pathTargetTitle,
  rightPanelReserved = false,
  labels,
  onModeChange,
  onHealthAction,
}: TopologyAnalysisBarProps) {
  const [overviewBriefCopied, setOverviewBriefCopied] = useState(false);
  const [healthCopied, setHealthCopied] = useState(false);
  const [healthMcpCopied, setHealthMcpCopied] = useState(false);
  const [healthMcpImpactCopied, setHealthMcpImpactCopied] = useState(false);
  const [healthSyncGateCopied, setHealthSyncGateCopied] = useState(false);
  const [focusBriefCopied, setFocusBriefCopied] = useState(false);
  const [focusMcpCopied, setFocusMcpCopied] = useState(false);
  const [focusMcpImpactCopied, setFocusMcpImpactCopied] = useState(false);
  const [focusSyncGateCopied, setFocusSyncGateCopied] = useState(false);
  const [pathEvidenceCopied, setPathEvidenceCopied] = useState(false);
  const [pathMcpCopied, setPathMcpCopied] = useState(false);
  const [pathRelationPreflightCopied, setPathRelationPreflightCopied] =
    useState(false);
  const [pathExplainRelationCopied, setPathExplainRelationCopied] =
    useState(false);
  const [pathAllPathsPlanCopied, setPathAllPathsPlanCopied] = useState(false);
  const [pathAllPathsCopied, setPathAllPathsCopied] = useState(false);
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const resolvedPathTitle =
    pathSourceTitle && pathTargetTitle
      ? labels.pathResolved
          .replace("{source}", pathSourceTitle)
          .replace("{target}", pathTargetTitle)
      : null;
  const prompt =
    mode === "focus"
      ? selectedTitle
        ? labels.focusSelected.replace("{title}", selectedTitle)
        : labels.focusPrompt
      : mode === "path"
        ? resolvedPathTitle
          ? resolvedPathTitle
          : pathSourceTitle || selectedTitle
          ? labels.pathSelected.replace(
              "{title}",
              pathSourceTitle ?? selectedTitle ?? "",
            )
          : labels.pathPrompt
        : mode === "health"
          ? labels.healthPrompt
          : labels.overviewPrompt;

  const primaryLabel =
    mode === "health" ? labels.metricIssues : labels.metricNodes;
  const healthNextAction = healthAction
    ? getTopologyHealthNextAction(healthAction.kind, {
        actionStale: labels.healthEvidenceActionStale,
        actionOrphan: labels.healthEvidenceActionOrphan,
        actionPromotion: labels.healthEvidenceActionPromotion,
      })
    : null;

  const copyOverviewBrief = useCallback(async () => {
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const healthUrl =
      typeof window === "undefined"
        ? "/topology/?mode=health"
        : buildOverviewModeUrl(window.location.href, "health");
    const ok = await copyText(
      formatTopologyOverviewBrief({
        summary,
        labels: {
          title: labels.overviewBriefTitle,
          totalNodes: labels.overviewBriefTotalNodes,
          totalRelations: labels.overviewBriefTotalRelations,
          healthSignals: labels.overviewBriefHealthSignals,
          stale: labels.healthStale,
          orphan: labels.healthOrphan,
          promotion: labels.healthPromotion,
          url: labels.healthEvidenceUrl,
          healthUrl: labels.overviewBriefHealthUrl,
          insightsUrl: labels.overviewBriefInsightsUrl,
          agentCheck: labels.overviewBriefAgentCheck,
          mcpCheck: labels.overviewBriefMcpCheck,
          mcpQueryPlan: labels.overviewBriefMcpQueryPlan,
          workspaceCheck: labels.overviewBriefWorkspaceCheck,
          mcpWorkspaceCheck: labels.overviewBriefMcpWorkspaceCheck,
        },
        url: currentUrl,
        healthUrl,
        insightsUrl: "/ontology/insights/",
      }),
    );
    if (!ok) return;
    setOverviewBriefCopied(true);
    window.setTimeout(() => setOverviewBriefCopied(false), 1600);
  }, [labels, summary]);

  const copyHealthEvidence = useCallback(async () => {
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const inspectUrl =
      typeof window === "undefined" || !healthAction
        ? null
        : buildHealthInspectUrl(window.location.href, healthAction.slug);
    const ok = await copyText(
      formatTopologyHealthBrief({
        summary,
        actionTarget: healthAction,
        labels: {
          title: labels.healthEvidenceTitle,
          total: labels.healthEvidenceTotal,
          stale: labels.healthStale,
          orphan: labels.healthOrphan,
          promotion: labels.healthPromotion,
          inspect: labels.healthInspect,
          inspectUrl: labels.healthEvidenceInspectUrl,
          repairUrl: labels.healthEvidenceRepairUrl,
          nextAction: labels.healthEvidenceNextAction,
          agentCheck: labels.healthEvidenceAgentCheck,
          mcpCheck: labels.healthEvidenceMcpCheck,
          relationPreflight: labels.healthEvidenceRelationPreflight,
          mcpRelationPreflight: labels.healthEvidenceMcpRelationPreflight,
          impactCheck: labels.healthEvidenceImpactCheck,
          mcpImpactCheck: labels.healthEvidenceMcpImpactCheck,
          syncGate: labels.healthEvidenceSyncGate,
          actionStale: labels.healthEvidenceActionStale,
          actionOrphan: labels.healthEvidenceActionOrphan,
          actionPromotion: labels.healthEvidenceActionPromotion,
          none: labels.healthEvidenceNone,
          url: labels.healthEvidenceUrl,
        },
        url: currentUrl,
        inspectUrl,
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setHealthCopied(true);
    window.setTimeout(() => setHealthCopied(false), 1600);
  }, [healthAction, labels, postChangeSyncPacket, summary]);

  const copyHealthMcpCheck = useCallback(async () => {
    if (!healthAction) return;
    const ok = await copyText(formatTopologyHealthMcpCheck(healthAction.slug));
    if (!ok) return;
    setHealthMcpCopied(true);
    window.setTimeout(() => setHealthMcpCopied(false), 1600);
  }, [healthAction]);

  const copyHealthMcpImpactCheck = useCallback(async () => {
    if (!healthAction) return;
    const ok = await copyText(formatTopologyHealthImpactMcpCheck(healthAction.slug));
    if (!ok) return;
    setHealthMcpImpactCopied(true);
    window.setTimeout(() => setHealthMcpImpactCopied(false), 1600);
  }, [healthAction]);

  const copyHealthSyncGate = useCallback(async () => {
    if (!healthAction) return;
    const ok = await copyText(postChangeSyncPacket);
    if (!ok) return;
    setHealthSyncGateCopied(true);
    window.setTimeout(() => setHealthSyncGateCopied(false), 1600);
  }, [healthAction, postChangeSyncPacket]);

  const copyFocusMcpCheck = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(formatTopologyHealthMcpCheck(selectedSlug));
    if (!ok) return;
    setFocusMcpCopied(true);
    window.setTimeout(() => setFocusMcpCopied(false), 1600);
  }, [selectedSlug]);

  const copyFocusBrief = useCallback(async () => {
    if (!selectedSlug || !selectedTitle) return;
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const focusUrl =
      typeof window === "undefined"
        ? null
        : buildFocusInspectUrl(window.location.href, selectedSlug);
    const ok = await copyText(
      formatTopologyFocusBrief({
        slug: selectedSlug,
        title: selectedTitle,
        labels: {
          title: labels.focusBriefTitle,
          node: labels.focusBriefNode,
          url: labels.focusBriefUrl,
          ontologyUrl: labels.focusBriefOntologyUrl,
          builderUrl: labels.focusBriefBuilderUrl,
          reviewFocus: labels.focusBriefReviewFocus,
          agentCheck: labels.focusBriefAgentCheck,
          mcpCheck: labels.focusBriefMcpCheck,
          impactCheck: labels.focusBriefImpactCheck,
          mcpImpactCheck: labels.focusBriefMcpImpactCheck,
          syncGate: labels.focusBriefSyncGate,
        },
        url: currentUrl,
        focusUrl,
        ontologyUrl: buildOntologyNodeHref(selectedSlug),
        builderUrl: buildTopologyHealthRepairHref(selectedSlug),
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setFocusBriefCopied(true);
    window.setTimeout(() => setFocusBriefCopied(false), 1600);
  }, [labels, postChangeSyncPacket, selectedSlug, selectedTitle]);

  const copyFocusMcpImpactCheck = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(formatTopologyHealthImpactMcpCheck(selectedSlug));
    if (!ok) return;
    setFocusMcpImpactCopied(true);
    window.setTimeout(() => setFocusMcpImpactCopied(false), 1600);
  }, [selectedSlug]);

  const copyFocusSyncGate = useCallback(async () => {
    if (!selectedSlug) return;
    const ok = await copyText(postChangeSyncPacket);
    if (!ok) return;
    setFocusSyncGateCopied(true);
    window.setTimeout(() => setFocusSyncGateCopied(false), 1600);
  }, [postChangeSyncPacket, selectedSlug]);

  const copyPathEvidence = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug || !pathSourceTitle || !pathTargetTitle) {
      return;
    }
    const currentUrl =
      typeof window === "undefined" ? null : window.location.href;
    const ok = await copyText(
      formatTopologyPathEvidenceBrief({
        sourceSlug: pathSourceSlug,
        targetSlug: pathTargetSlug,
        sourceTitle: pathSourceTitle,
        targetTitle: pathTargetTitle,
        labels: {
          title: labels.pathEvidenceTitle,
          source: labels.pathEvidenceSource,
          target: labels.pathEvidenceTarget,
          url: labels.pathEvidenceUrl,
          sourceOntologyUrl: labels.pathEvidenceSourceOntologyUrl,
          targetOntologyUrl: labels.pathEvidenceTargetOntologyUrl,
          sourceBuilderUrl: labels.pathEvidenceSourceBuilderUrl,
          targetBuilderUrl: labels.pathEvidenceTargetBuilderUrl,
          cliCheck: labels.pathEvidenceCliCheck,
          mcpCheck: labels.pathEvidenceMcpCheck,
          relationPreflightReason: labels.pathEvidenceRelationPreflightReason,
          relationPreflightMcpCheck:
            labels.pathEvidenceRelationPreflightMcpCheck,
          explainRelationMcpCheck: labels.pathEvidenceExplainRelationMcpCheck,
          allPathsPlanMcpCheck: labels.pathEvidenceAllPathsPlanMcpCheck,
          allPathsMcpCheck: labels.pathEvidenceAllPathsMcpCheck,
          allPathsEvidenceContract: labels.pathEvidenceAllPathsCopyInstruction,
          proofChecklist: labels.pathProofChecklist,
          proofVisiblePath: labels.pathProofVisiblePath,
          proofRelationPreflight: labels.pathProofRelationPreflight,
          proofExplainRelation: labels.pathProofExplainRelation,
          proofBoundedTraversal: labels.pathProofBoundedTraversal,
          proofPostWriteSync: labels.pathProofPostWriteSync,
          proofStatusReady: labels.pathProofStatusReady,
          proofStatusRequired: labels.pathProofStatusRequired,
          proofStatusAfterWrite: labels.pathProofStatusAfterWrite,
          syncGate: labels.pathEvidencePostWriteSyncGate,
        },
        url: currentUrl,
        syncGatePacket: postChangeSyncPacket,
      }),
    );
    if (!ok) return;
    setPathEvidenceCopied(true);
    window.setTimeout(() => setPathEvidenceCopied(false), 1600);
  }, [
    labels,
    pathSourceSlug,
    pathSourceTitle,
    pathTargetSlug,
    pathTargetTitle,
    postChangeSyncPacket,
  ]);

  const copyPathMcpCheck = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(formatTopologyPathMcpCheck(pathSourceSlug, pathTargetSlug));
    if (!ok) return;
    setPathMcpCopied(true);
    window.setTimeout(() => setPathMcpCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathRelationPreflight = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathRelationPreflightMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathRelationPreflightCopied(true);
    window.setTimeout(() => setPathRelationPreflightCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathExplainRelation = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathExplainRelationMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathExplainRelationCopied(true);
    window.setTimeout(() => setPathExplainRelationCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathAllPathsPlan = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathAllPathsPlanMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathAllPathsPlanCopied(true);
    window.setTimeout(() => setPathAllPathsPlanCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  const copyPathAllPaths = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug) return;
    const ok = await copyText(
      formatTopologyPathAllPathsMcpCheck(pathSourceSlug, pathTargetSlug),
    );
    if (!ok) return;
    setPathAllPathsCopied(true);
    window.setTimeout(() => setPathAllPathsCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug]);

  return (
    <section
      aria-label={labels.title}
      className={`pointer-events-auto absolute inset-x-3 top-[72px] z-20 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 shadow-[0_14px_34px_rgba(0,0,0,0.18)] md:hidden lg:right-auto lg:top-4 lg:block lg:-translate-x-1/2 ${
        rightPanelReserved
          ? "lg:left-[calc(50%_-_200px)] lg:w-[min(560px,calc(100vw_-_840px))]"
          : "lg:left-1/2 lg:w-[min(680px,calc(100vw-440px))]"
      }`}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid w-full grid-cols-4 gap-1 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] p-1 lg:w-auto">
          {MODES.map(({ value, icon: Icon, labelKey }) => {
            const active = value === mode;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onModeChange(value)}
                aria-pressed={active}
                className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-[11px] font-[var(--font-weight-signature)] transition-colors ${
                  active
                    ? "bg-[color:rgba(94,106,210,0.18)] text-[color:var(--color-text-primary)]"
                    : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                <Icon size={13} aria-hidden />
                <span>{labels[labelKey]}</span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 border-t border-[color:var(--color-border-soft)] pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <p className="truncate text-[12px] text-[color:var(--color-text-secondary)]">
            {prompt}
          </p>
          <div className="mt-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.primaryMetric}
              </span>{" "}
              {primaryLabel}
            </span>
            <span className="h-2 w-px bg-[color:var(--color-overlay-3)]" />
            <span>
              <span className="text-[color:var(--color-text-secondary)]">
                {summary.secondaryMetric}
              </span>{" "}
              {labels.metricRelations}
            </span>
          </div>
          {mode === "health" ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                <HealthBreakdownChip
                  count={summary.healthBreakdown.stale}
                  label={labels.healthStale}
                />
                <HealthBreakdownChip
                  count={summary.healthBreakdown.orphan}
                  label={labels.healthOrphan}
                />
                <HealthBreakdownChip
                  count={summary.healthBreakdown.promotion}
                  label={labels.healthPromotion}
                />
              </div>
              {healthAction ? (
                <div className="mt-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onHealthAction(healthAction.slug)}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <HeartPulse size={12} aria-hidden />
                      <span className="truncate">
                        {labels.healthInspect} {healthAction.kind}:{" "}
                        {healthAction.title}
                      </span>
                    </button>
                    <Link
                      href={buildTopologyHealthRepairHref(healthAction.slug)}
                      className="inline-flex h-[26px] items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {labels.healthRepair}
                    </Link>
                  </div>
                  {healthNextAction ? (
                    <p className="mt-1 max-w-full truncate text-[10.5px] text-[color:var(--color-text-tertiary)]">
                      <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                        {labels.healthEvidenceNextAction}:
                      </span>{" "}
                      {healthNextAction}
                    </p>
                  ) : null}
                  <div className="mt-2 rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.055)] px-2 py-1.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(190,199,255,0.82)]">
                      {labels.healthRepairOrderTitle}
                    </p>
                    <dl
                      className="mt-2 grid gap-1.5 sm:grid-cols-3"
                      data-testid="topology-health-repair-order"
                    >
                      <PathProofStep
                        label={labels.healthRepairOrderInspect}
                        status={labels.pathProofStatusReady}
                        tone="ready"
                      />
                      <PathProofStep
                        label={labels.healthRepairOrderRepair}
                        status={labels.pathProofStatusRequired}
                        tone="required"
                      />
                      <PathProofStep
                        label={labels.healthRepairOrderSync}
                        status={labels.pathProofStatusAfterWrite}
                        tone="after"
                      />
                    </dl>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={copyHealthMcpCheck}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                      aria-label={
                        healthMcpCopied
                          ? labels.healthMcpCopiedAriaLabel
                          : labels.healthMcpCopyAriaLabel
                      }
                    >
                      {healthMcpCopied ? (
                        <Check size={12} aria-hidden />
                      ) : (
                        <Clipboard size={12} aria-hidden />
                      )}
                      <span>
                        {healthMcpCopied
                          ? labels.healthMcpCopied
                          : labels.healthMcpCopy}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={copyHealthMcpImpactCheck}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                      aria-label={
                        healthMcpImpactCopied
                          ? labels.healthMcpImpactCopiedAriaLabel
                          : labels.healthMcpImpactCopyAriaLabel
                      }
                    >
                      {healthMcpImpactCopied ? (
                        <Check size={12} aria-hidden />
                      ) : (
                        <Clipboard size={12} aria-hidden />
                      )}
                      <span>
                        {healthMcpImpactCopied
                          ? labels.healthMcpImpactCopied
                          : labels.healthMcpImpactCopy}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={copyHealthSyncGate}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                      aria-label={
                        healthSyncGateCopied
                          ? labels.healthSyncGateCopiedAriaLabel
                          : labels.healthSyncGateCopyAriaLabel
                      }
                    >
                      {healthSyncGateCopied ? (
                        <Check size={12} aria-hidden />
                      ) : (
                        <Clipboard size={12} aria-hidden />
                      )}
                      <span>
                        {healthSyncGateCopied
                          ? labels.healthSyncGateCopied
                          : labels.healthSyncGateCopy}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={copyHealthEvidence}
                className="mt-2 ml-1 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  healthCopied
                    ? labels.healthCopiedAriaLabel
                    : labels.healthCopyAriaLabel
                }
              >
                {healthCopied ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
                <span>{healthCopied ? labels.healthCopied : labels.healthCopy}</span>
              </button>
            </>
          ) : null}
          {mode === "overview" ? (
            <div className="mt-2 grid gap-2">
              <div className="rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(190,199,255,0.78)]">
                  {labels.overviewWorkOrderTitle}
                </p>
                <ol
                  className="mt-2 grid gap-1.5 sm:grid-cols-4"
                  data-testid="topology-overview-work-order"
                >
                  <OverviewWorkStep index={1} label={labels.overviewWorkOrderRead} />
                  <OverviewWorkStep index={2} label={labels.overviewWorkOrderFocus} />
                  <OverviewWorkStep index={3} label={labels.overviewWorkOrderPath} />
                  <OverviewWorkStep index={4} label={labels.overviewWorkOrderHealth} />
                </ol>
              </div>
              <button
                type="button"
                onClick={copyOverviewBrief}
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  overviewBriefCopied
                    ? labels.overviewBriefCopiedAriaLabel
                    : labels.overviewBriefCopyAriaLabel
                }
              >
                {overviewBriefCopied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Clipboard size={12} aria-hidden />
                )}
                <span>
                  {overviewBriefCopied
                    ? labels.overviewBriefCopied
                    : labels.overviewBriefCopy}
                </span>
              </button>
            </div>
          ) : null}
          {mode === "path" && pathSourceSlug && pathTargetSlug ? (
            <div className="mt-2 grid gap-2">
              <div className="rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.055)] px-2 py-1.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(190,199,255,0.82)]">
                  {labels.pathProofOrderTitle}
                </p>
                <p className="mt-1 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {labels.pathProofOrderDesc}
                </p>
                <dl
                  className="mt-2 grid gap-1.5 sm:grid-cols-2"
                  data-testid="topology-path-proof-checklist"
                >
                  <PathProofStep
                    label={labels.pathProofVisiblePath}
                    status={labels.pathProofStatusReady}
                    tone="ready"
                  />
                  <PathProofStep
                    label={labels.pathProofRelationPreflight}
                    status={labels.pathProofStatusRequired}
                    tone="required"
                  />
                  <PathProofStep
                    label={labels.pathProofExplainRelation}
                    status={labels.pathProofStatusRequired}
                    tone="required"
                  />
                  <PathProofStep
                    label={labels.pathProofBoundedTraversal}
                    status={labels.pathProofStatusRequired}
                    tone="required"
                  />
                  <PathProofStep
                    label={labels.pathProofPostWriteSync}
                    status={labels.pathProofStatusAfterWrite}
                    tone="after"
                  />
                </dl>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={copyPathEvidence}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathEvidenceCopied
                      ? labels.pathEvidenceCopiedAriaLabel
                      : labels.pathEvidenceCopyAriaLabel
                  }
                >
                  {pathEvidenceCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathEvidenceCopied
                      ? labels.pathEvidenceCopied
                      : labels.pathEvidenceCopy}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={copyPathMcpCheck}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathMcpCopied
                      ? labels.pathMcpCopiedAriaLabel
                      : labels.pathMcpCopyAriaLabel
                  }
                >
                  {pathMcpCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>{pathMcpCopied ? labels.pathMcpCopied : labels.pathMcpCopy}</span>
                </button>
                <button
                  type="button"
                  onClick={copyPathRelationPreflight}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathRelationPreflightCopied
                      ? labels.pathRelationPreflightCopiedAriaLabel
                      : labels.pathRelationPreflightCopyAriaLabel
                  }
                >
                  {pathRelationPreflightCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathRelationPreflightCopied
                      ? labels.pathRelationPreflightCopied
                      : labels.pathRelationPreflightCopy}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={copyPathExplainRelation}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathExplainRelationCopied
                      ? labels.pathExplainRelationCopiedAriaLabel
                      : labels.pathExplainRelationCopyAriaLabel
                  }
                >
                  {pathExplainRelationCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathExplainRelationCopied
                      ? labels.pathExplainRelationCopied
                      : labels.pathExplainRelationCopy}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={copyPathAllPathsPlan}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathAllPathsPlanCopied
                      ? labels.pathAllPathsPlanCopiedAriaLabel
                      : labels.pathAllPathsPlanCopyAriaLabel
                  }
                >
                  {pathAllPathsPlanCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathAllPathsPlanCopied
                      ? labels.pathAllPathsPlanCopied
                      : labels.pathAllPathsPlanCopy}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={copyPathAllPaths}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={
                    pathAllPathsCopied
                      ? labels.pathAllPathsCopiedAriaLabel
                      : labels.pathAllPathsCopyAriaLabel
                  }
                >
                  {pathAllPathsCopied ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clipboard size={12} aria-hidden />
                  )}
                  <span>
                    {pathAllPathsCopied
                      ? labels.pathAllPathsCopied
                      : labels.pathAllPathsCopy}
                  </span>
                </button>
                <Link
                  href={buildOntologyNodeHref(pathSourceSlug)}
                  className="inline-flex items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathSourceOntology}
                </Link>
                <Link
                  href={buildOntologyNodeHref(pathTargetSlug)}
                  className="inline-flex items-center rounded-md border border-[color:rgba(94,106,210,0.26)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathTargetOntology}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathSourceSlug)}
                  className="inline-flex items-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathSourceBuilder}
                </Link>
                <Link
                  href={buildTopologyHealthRepairHref(pathTargetSlug)}
                  className="inline-flex items-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.pathTargetBuilder}
                </Link>
              </div>
            </div>
          ) : null}
          {mode === "focus" && selectedSlug ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={copyFocusBrief}
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  focusBriefCopied
                    ? labels.focusBriefCopiedAriaLabel
                    : labels.focusBriefCopyAriaLabel
                }
              >
                {focusBriefCopied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Clipboard size={12} aria-hidden />
                )}
                <span>
                  {focusBriefCopied
                    ? labels.focusBriefCopied
                    : labels.focusBriefCopy}
                </span>
              </button>
              <button
                type="button"
                onClick={copyFocusMcpCheck}
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  focusMcpCopied
                    ? labels.focusMcpCopiedAriaLabel
                    : labels.focusMcpCopyAriaLabel
                }
              >
                {focusMcpCopied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Clipboard size={12} aria-hidden />
                )}
                <span>
                  {focusMcpCopied ? labels.focusMcpCopied : labels.focusMcpCopy}
                </span>
              </button>
              <button
                type="button"
                onClick={copyFocusMcpImpactCheck}
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  focusMcpImpactCopied
                    ? labels.focusMcpImpactCopiedAriaLabel
                    : labels.focusMcpImpactCopyAriaLabel
                }
              >
                {focusMcpImpactCopied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Clipboard size={12} aria-hidden />
                )}
                <span>
                  {focusMcpImpactCopied
                    ? labels.focusMcpImpactCopied
                    : labels.focusMcpImpactCopy}
                </span>
              </button>
              <button
                type="button"
                onClick={copyFocusSyncGate}
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.50)] hover:text-[color:var(--color-text-primary)]"
                aria-label={
                  focusSyncGateCopied
                    ? labels.focusSyncGateCopiedAriaLabel
                    : labels.focusSyncGateCopyAriaLabel
                }
              >
                {focusSyncGateCopied ? (
                  <Check size={12} aria-hidden />
                ) : (
                  <Clipboard size={12} aria-hidden />
                )}
                <span>
                  {focusSyncGateCopied
                    ? labels.focusSyncGateCopied
                    : labels.focusSyncGateCopy}
                </span>
              </button>
              <Link
                href={buildOntologyNodeHref(selectedSlug)}
                className="inline-flex items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
              >
                {labels.focusOpenOntology}
              </Link>
              <Link
                href={buildTopologyHealthRepairHref(selectedSlug)}
                className="inline-flex items-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
              >
                {labels.focusOpenBuilder}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function buildOverviewModeUrl(
  currentUrl: string,
  mode: TopologyAnalysisMode,
): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", mode);
  return url.toString();
}

function buildHealthInspectUrl(currentUrl: string, slug: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", "health");
  url.searchParams.set("p", slug);
  return url.toString();
}

function buildFocusInspectUrl(currentUrl: string, slug: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("mode", "focus");
  url.searchParams.set("p", slug);
  return url.toString();
}

function HealthBreakdownChip({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <span className="rounded-sm border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 text-[color:var(--color-text-tertiary)]">
      <span className="text-[color:var(--color-text-secondary)]">{count}</span>{" "}
      {label}
    </span>
  );
}

function OverviewWorkStep({
  index,
  label,
}: {
  index: number;
  label: string;
}) {
  return (
    <li className="min-w-0 list-none rounded border border-[color:rgba(94,106,210,0.14)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.10em] text-[color:rgba(190,199,255,0.72)]">
        {String(index).padStart(2, "0")}
      </span>
      <span className="mt-0.5 block truncate text-[10.5px] text-[color:var(--color-text-secondary)]">
        {label}
      </span>
    </li>
  );
}

function PathProofStep({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: "after" | "ready" | "required";
}) {
  const toneClass =
    tone === "ready"
      ? "border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.07)] text-[color:rgba(151,230,198,0.94)]"
      : tone === "after"
        ? "border-[color:rgba(255,179,71,0.24)] bg-[color:rgba(255,179,71,0.06)] text-[color:rgba(255,207,122,0.94)]"
        : "border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] text-[color:rgba(190,199,255,0.92)]";

  return (
    <div className="min-w-0 rounded border border-[color:rgba(94,106,210,0.14)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1">
      <dt className="truncate text-[10.5px] text-[color:var(--color-text-secondary)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.10em] ${toneClass}`}
      >
        {status}
      </dd>
    </div>
  );
}
