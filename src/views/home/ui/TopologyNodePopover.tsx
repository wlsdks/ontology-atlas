"use client";

import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clipboard,
  FileText,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useMediaQuery } from "usehooks-ts";
import type { TopologyRelationQuality } from "../lib/topology-analysis";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import type { NodeSignificanceLevel } from "../lib/topology-node-significance";

type RelationEvidenceState = "source-backed" | "authored" | "needs-review";
type RelationAgentGateKind = "handoff-ready" | "preflight-first" | "review-first";
type RelationCopyActionKind = "explain_relation" | "relation_check";
const NODE_POPOVER_RELATION_ROW_RENDER_BUDGET = 2;

/**
 * Resolved (i18n-applied) plain-language "so what" of the node. The parent
 * builds these sentences from {@link import("../lib/topology-node-significance").NodeSignificanceModel}
 * so the popover stays locale-agnostic and unit-testable on plain strings.
 */
export interface TopologyNodeSignificancePresentation {
  /** "{domain} 영역에 속한 {kind}" — what it is. */
  whatLine: string;
  /** Why it matters (derived level sentence, or authored override). */
  importanceLine: string;
  /** What it leans on. */
  dependsOnLine: string;
  /** Blast radius if changed. */
  impactLine: string;
  level: NodeSignificanceLevel;
}

export interface TopologyNodePopoverLabels {
  /** "연결된 노드" — connections section heading. */
  connections: string;
  /** "이 노드를 쓰는 곳" — incoming, plain language (was 영향받음). */
  usedBy: string;
  /** "이 노드가 기대는 곳" — outgoing, plain language (was 의존). */
  dependsOn: string;
  /** "직접 연결 없음" — empty state. */
  noConnections: string;
  /** "전체 상세" — opt-in drill into the full drawer. */
  openFullDetail: string;
  /** "지도 보기" — collapse the sheet so the map becomes primary again. */
  collapse: string;
  /** "상세 보기" — expand the collapsed sheet back to the node detail. */
  expand: string;
  /** "닫기" — close aria-label. */
  close: string;
  /** "더" — suffix for the hidden remainder ("+5 더"). */
  moreSuffix: string;
  /** "Agent handoff" — compact action rail title. */
  actionRailTitle: string;
  /** "Copy" — compact hint that action buttons copy agent handoff packets. */
  actionRailHint: string;
  /** "{count}개는 지도에 펼쳐져 있어요" — 도킹 열과의 중복 안내. */
  expandedNote: string;
  /** "Relation lens" — small block explaining how to read direct ontology edges. */
  relationLensTitle: string;
  /** "{count} direct fact" — singular direct typed edge count. */
  relationLensDirectFactOne: string;
  /** "{count} direct facts" — plural direct typed edge count. */
  relationLensDirectFactOther: string;
  /** "{count} relation type" — singular distinct relation type count. */
  relationLensTypeOne: string;
  /** "{count} relation types" — plural distinct relation type count. */
  relationLensTypeOther: string;
  /** Compact collapsed-chip label for direct relation facts. */
  relationLensCompactFacts: string;
  /** Compact collapsed-chip label for distinct relation types. */
  relationLensCompactTypes: string;
  /** "Typed ontology facts, not inferred similarity scores." */
  relationLensNoScores: string;
  /** "Relation quality" — edge confidence/provenance summary. */
  relationQualityTitle: string;
  relationQualityLabels: Record<TopologyRelationQuality, string>;
  /** "Agent readiness" — whether direct relations can move into MCP handoff. */
  agentReadinessTitle: string;
  agentReadinessLabels: Record<"ready" | "preflight" | "review", string>;
  /** Compact visible gate chips. Machine-readable gate ids stay in data attributes. */
  agentGateChipLabels: Record<RelationAgentGateKind, string>;
  /** Compact visible copy action chips. Machine-readable MCP operations stay in data attributes. */
  relationCopyActionChipLabels: Record<RelationCopyActionKind, string>;
  /** Compact visible payload chip. The JSON payload stays in data attributes/title. */
  relationPayloadChipLabel: string;
  /** Compact visible evidence prefix in relation rows. */
  relationEvidenceChipLabel: string;
  /** Display labels for raw ontology kind tokens. Unknown/missing falls back to the raw token. */
  kindLabels: Record<string, string>;
  /** Display labels for raw relation type tokens. Unknown/missing falls back to the raw token. */
  relationTypeLabels: Record<string, string>;
}

export interface TopologyNodePopoverAction {
  kind: "focus-brief" | "mcp-profile" | "mcp-impact";
  label: string;
  ariaLabel: string;
  onClick: () => void;
}

export interface TopologyNodePopoverProps {
  focus: TopologyNodeFocusModel;
  labels: TopologyNodePopoverLabels;
  /**
   * Plain-language "so what" block — the primary win for non-developer readers.
   * Optional: when omitted (e.g. no insight yet) the popover renders without it.
   */
  significance?: TopologyNodeSignificancePresentation | null;
  /**
   * 지도에 카드로 이미 펼쳐진 자식 id 집합 — 같은 노드를 좌측 도킹 열과
   * 팝오버 리스트가 동시에 두 번 나열하지 않는다 (Toss "한 화면에 한 가지").
   */
  expandedChildIds?: ReadonlySet<string> | null;
  onSelectConnection: (id: string) => void;
  onOpenFullDetail: () => void;
  onClose: () => void;
  actions?: readonly TopologyNodePopoverAction[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  className?: string;
}

/**
 * 토폴로지 노드 클릭 시 노드 옆에 뜨는 *컴팩트* 팝오버.
 *
 * 풀스크린 `TopologyOntologyDrawer` 를 클릭 default 에서 대체한다 — overview
 * first, details-on-demand. 노드 + 직접 연결만 보여주고, 전체 상세는
 * `전체 상세 →` opt-in. 디자인 시스템 토큰만 사용(무채색 + 단일 인디고, 28px
 * full-bleed 아님). 설계: `docs/TOPOLOGY-FOCUS-AND-SCALE.md`.
 *
 * 위치(노드 앵커 / 화면 경계 flip)는 부모가 `className` 으로 제어한다.
 */
export function TopologyNodePopover({
  focus,
  labels,
  significance,
  expandedChildIds = null,
  onSelectConnection,
  onOpenFullDetail,
  onClose,
  actions = [],
  collapsed = false,
  onToggleCollapsed,
  className,
}: TopologyNodePopoverProps) {
  const expandedShellRef = useRef<HTMLDivElement | null>(null);
  const wasCollapsedRef = useRef(collapsed);
  const total = focus.usedByCount + focus.dependsOnCount;
  const focusKindLabel = labels.kindLabels[focus.kind] ?? focus.kind;
  // 지도에 펼쳐진 자식은 리스트에서 제외 — 팝오버는 캔버스가 못 보여주는
  // 것(나머지 관계·평문 의미·카운트)에 전념한다.
  const visibleConnections = expandedChildIds
    ? focus.connections.filter((connection) => !expandedChildIds.has(connection.id))
    : focus.connections;
  const expandedConnections = expandedChildIds
    ? focus.connections.filter((connection) => expandedChildIds.has(connection.id))
    : [];
  const relationPreviewSource =
    visibleConnections.length > 0
      ? "remaining-direct-facts"
      : expandedConnections.length > 0
        ? "map-expanded-proof"
        : "none";
  const previewConnections =
    relationPreviewSource === "map-expanded-proof" ? expandedConnections : visibleConnections;
  const renderedConnections = previewConnections.slice(0, NODE_POPOVER_RELATION_ROW_RENDER_BUDGET);
  const expandedCount = focus.connections.length - visibleConnections.length;
  const renderHiddenCount =
    relationPreviewSource === "remaining-direct-facts"
      ? Math.max(0, visibleConnections.length - renderedConnections.length)
      : 0;
  const hiddenConnectionCount = focus.hiddenConnectionCount + renderHiddenCount;
  const fullDetailActionLabel =
    hiddenConnectionCount > 0
      ? `${labels.openFullDetail}, +${hiddenConnectionCount} ${labels.moreSuffix}`
      : labels.openFullDetail;
  const relationTypeCount = new Set(focus.connections.map((connection) => connection.relationType))
    .size;
  const relationFactLabel = (
    total === 1 ? labels.relationLensDirectFactOne : labels.relationLensDirectFactOther
  ).replace("{count}", String(total));
  const relationTypeLabel = (
    relationTypeCount === 1 ? labels.relationLensTypeOne : labels.relationLensTypeOther
  ).replace("{count}", String(relationTypeCount));
  const relationQualityItems = relationQualityOrder.map((quality) => ({
    quality,
    label: labels.relationQualityLabels[quality],
    count: focus.relationQuality[quality],
  }));
  const relationQualitySummary = relationQualityItems
    .map(({ label, count }) => `${label} ${count}`)
    .join(" · ");
  const relationQualityMeterItems = [
    {
      key: "strong" as const,
      count: focus.relationQuality.strong,
      token: "--topology-overview-quality-strong-meter",
    },
    {
      key: "supported" as const,
      count: focus.relationQuality.supported,
      token: "--topology-overview-quality-supported-meter",
    },
    {
      key: "weak" as const,
      count: focus.relationQuality.weak,
      token: "--topology-overview-quality-weak-meter",
    },
    {
      key: "review" as const,
      count: focus.relationQuality.review,
      token: "--topology-overview-quality-review-meter",
    },
  ];
  const relationQualityMeterTotal = relationQualityMeterItems.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const agentReadinessCounts = focus.connections.reduce(
    (counts, connection) => {
      const gate = relationAgentGateKind(connection);
      if (gate === "handoff-ready") counts.ready += 1;
      else if (gate === "preflight-first") counts.preflight += 1;
      else counts.review += 1;
      return counts;
    },
    { ready: 0, preflight: 0, review: 0 },
  );
  const agentReadinessItems = [
    {
      key: "ready" as const,
      label: labels.agentReadinessLabels.ready,
      displayLabel: compactAgentReadinessLabel(
        "ready",
        labels.agentReadinessLabels.ready,
      ),
      count: agentReadinessCounts.ready,
    },
    {
      key: "preflight" as const,
      label: labels.agentReadinessLabels.preflight,
      displayLabel: compactAgentReadinessLabel(
        "preflight",
        labels.agentReadinessLabels.preflight,
      ),
      count: agentReadinessCounts.preflight,
    },
    {
      key: "review" as const,
      label: labels.agentReadinessLabels.review,
      displayLabel: compactAgentReadinessLabel(
        "review",
        labels.agentReadinessLabels.review,
      ),
      count: agentReadinessCounts.review,
    },
  ];
  const agentReadinessSummary = agentReadinessItems
    .map(({ label, count }) => `${label} ${count}`)
    .join(" · ");
  const agentReadinessMeterItems = [
    {
      key: "ready" as const,
      count: agentReadinessCounts.ready,
      token: "--topology-overview-readiness-ready-meter",
    },
    {
      key: "preflight" as const,
      count: agentReadinessCounts.preflight,
      token: "--topology-overview-readiness-preflight-meter",
    },
    {
      key: "review" as const,
      count: agentReadinessCounts.review,
      token: "--topology-overview-readiness-review-meter",
    },
  ];
  const agentReadinessMeterTotal =
    agentReadinessCounts.ready +
    agentReadinessCounts.preflight +
    agentReadinessCounts.review;
  const expandedRelationTypeCount = new Set(
    expandedConnections.map((connection) => connection.relationType),
  ).size;
  const expandedRelationQualitySummary = relationQualityOrder
    .map((quality) => {
      const count = expandedConnections.filter(
        (connection) => connection.relationQuality === quality,
      ).length;
      return `${labels.relationQualityLabels[quality]} ${count}`;
    })
    .join(" · ");
  const expandedAgentReadinessCounts = expandedConnections.reduce(
    (counts, connection) => {
      const gate = relationAgentGateKind(connection);
      if (gate === "handoff-ready") counts.ready += 1;
      else if (gate === "preflight-first") counts.preflight += 1;
      else counts.review += 1;
      return counts;
    },
    { ready: 0, preflight: 0, review: 0 },
  );
  const expandedAgentReadinessSummary = [
    {
      label: labels.agentReadinessLabels.ready,
      count: expandedAgentReadinessCounts.ready,
    },
    {
      label: labels.agentReadinessLabels.preflight,
      count: expandedAgentReadinessCounts.preflight,
    },
    {
      label: labels.agentReadinessLabels.review,
      count: expandedAgentReadinessCounts.review,
    },
  ]
    .map(({ label, count }) => `${label} ${count}`)
    .join(" · ");
  const selectedNodeSummary = `${focus.kind} ${focus.id} · ${focus.title}`;
  const selectedNodeAttributes = {
    "data-selected-node-id": focus.id,
    "data-selected-node-kind": focus.kind,
    "data-selected-node-title": focus.title,
    "data-selected-node-source": focus.sourceSlug ?? "",
    "data-selected-node-summary": selectedNodeSummary,
  };
  const primaryAction = actions[0] ?? null;
  const handoffContract =
    actions.length > 0 ? "selected-node-actions-visible" : "detail-only";
  const compactActionLabel = useCallback(
    (action: TopologyNodePopoverAction) =>
      compactNodePopoverActionLabel(action.kind, action.label),
    [],
  );
  const collapsedActionContract = primaryAction
    ? "label-visible-above-480"
    : "icon-only-under-480";
  const showCompactMapReturn = useMediaQuery("(max-width: 1023px)", {
    initializeWithValue: false,
  });

  useEffect(() => {
    const wasCollapsed = wasCollapsedRef.current;
    wasCollapsedRef.current = collapsed;
    if (!wasCollapsed || collapsed) return;
    const frame = window.requestAnimationFrame(() => {
      expandedShellRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [collapsed]);

  if (collapsed) {
    return (
      <div
        role="dialog"
        aria-label={focus.title}
        {...selectedNodeAttributes}
        data-testid="topology-node-popover"
        data-topology-node-popover="selected-node-inspector"
        data-node-popover-shell-contract="selected-node-inspector-shell"
        data-surface-role="active-node-inspector"
        data-attention-role="supporting-detail"
        data-focus-primary="linked-focus-cluster"
        data-hierarchy-contract="click-focus-detail-support"
        data-collapsed="true"
        data-size-policy="context-chip"
        data-width-token="--topology-node-popover-fluid-width"
        data-rail-width-token="--topology-node-popover-rail-width"
        data-compact-gap-token="--topology-node-popover-chip-gap"
        data-compact-action-gap-token="--topology-node-popover-compact-action-gap"
        data-compact-action-size-token="--topology-node-popover-compact-action-size"
        data-compact-title-size-token="--topology-node-popover-compact-title-size"
        data-compact-title-leading-token="--topology-node-popover-compact-title-leading"
        data-compact-meta-size-token="--topology-node-popover-compact-meta-size"
        data-compact-kind-size-token="--topology-node-popover-compact-kind-size"
        data-compact-fact-size-token="--topology-node-popover-compact-fact-size"
        data-compact-action-label-size-token="--topology-node-popover-compact-action-label-size"
        data-compact-chrome-label-size-token="--topology-node-popover-compact-chrome-label-size"
        data-title-lines-token="--topology-node-popover-title-lines"
        data-popover-surface-token="--topology-node-popover-surface"
        data-popover-border-token="--topology-node-popover-border"
        data-responsive-width-contract="fluid-chip-to-rail"
        data-popover-scroll-contract="collapsed-chip-no-scroll"
        data-compact-handoff-contract={handoffContract}
        data-compact-action-contract={collapsedActionContract}
        data-title-readability-contract="selected-node-title-readable"
        data-compact-facts-layout-contract="facts-before-actions"
        data-phone-layout-contract="title-row-before-actions"
        className={`flex min-w-0 w-[var(--topology-node-popover-fluid-width)] max-w-[var(--topology-node-popover-fluid-width)] flex-wrap items-start gap-[var(--topology-node-popover-chip-gap)] overflow-hidden rounded-[var(--topology-node-popover-radius)] border border-[color:var(--topology-node-popover-border)] bg-[color:var(--topology-node-popover-surface)] px-[var(--topology-node-popover-chip-padding-x)] py-[var(--topology-node-popover-chip-padding-y)] shadow-[var(--topology-node-popover-shadow)] max-[540px]:items-start lg:w-[var(--topology-node-popover-rail-width)] lg:max-w-[var(--topology-node-popover-rail-width)] ${className ?? ""}`}
      >
        <div
          data-node-popover-compact-fact-priority="selected-node-facts-before-actions"
          data-phone-layout-contract="title-keeps-full-width-before-actions"
          className="min-w-0 basis-full"
        >
          <p
            data-selected-node-kind-label
            data-kind-text-token="--topology-node-popover-kind-text"
            data-kind-size-token="--topology-node-popover-compact-kind-size"
            className="font-mono text-[length:var(--topology-node-popover-compact-kind-size)] uppercase tracking-[0.12em] text-[color:var(--topology-node-popover-kind-text)]"
          >
            {focusKindLabel}
          </p>
          <h2
            data-testid="topology-node-popover-title"
            data-title-readability-contract="selected-node-title-readable"
            data-title-lines-token="--topology-node-popover-title-lines"
            data-title-text-token="--topology-node-popover-title-text"
            className="mt-0.5 line-clamp-[var(--topology-node-popover-title-lines)] text-[length:var(--topology-node-popover-compact-title-size)] font-[var(--font-weight-signature)] leading-[var(--topology-node-popover-compact-title-leading)] text-[color:var(--topology-node-popover-title-text)]"
          >
            {focus.title}
          </h2>
          <p
            data-selected-node-count-line
            data-count-text-token="--topology-node-popover-count-text"
            className="mt-0.5 truncate text-[length:var(--topology-node-popover-compact-meta-size)] text-[color:var(--topology-node-popover-count-text)]"
          >
            {labels.usedBy} {focus.usedByCount} · {labels.dependsOn} {focus.dependsOnCount}
          </p>
          <p
            data-testid="topology-node-popover-compact-relation-facts"
            data-compact-relation-facts-contract="collapsed-dock-surfaces-typed-facts"
            data-relation-fact-count={total}
            data-relation-type-count={relationTypeCount}
            data-relation-fact-label={relationFactLabel}
            data-relation-type-label={relationTypeLabel}
            data-compact-relation-fact-label={labels.relationLensCompactFacts}
            data-compact-relation-type-label={labels.relationLensCompactTypes}
            data-compact-relation-facts-surface-token="--topology-node-popover-context-surface"
            data-compact-relation-facts-border-token="--topology-node-popover-context-border"
            data-compact-relation-facts-text-token="--topology-node-popover-context-text"
            data-compact-relation-facts-size-token="--topology-node-popover-compact-fact-size"
            aria-label={`${relationFactLabel} · ${relationTypeLabel}`}
            className="mt-1 inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border border-[color:var(--topology-node-popover-context-border)] bg-[color:var(--topology-node-popover-context-surface)] px-1.5 py-0.5 font-mono text-[length:var(--topology-node-popover-compact-fact-size)] text-[color:var(--topology-node-popover-context-text)] max-[540px]:hidden"
          >
            <span className="shrink-0 uppercase tracking-[0.08em]">
              {labels.relationLensCompactFacts}
            </span>
            {" "}
            <span className="shrink-0 tabular-nums">{total}</span>
            {" "}
            <span
              aria-hidden="true"
              className="shrink-0 text-[color:var(--topology-node-popover-endpoint-separator)]"
            >
              ·
            </span>
            {" "}
            <span className="shrink-0 uppercase tracking-[0.08em]">
              {labels.relationLensCompactTypes}
            </span>
            {" "}
            <span className="min-w-0 truncate tabular-nums">{relationTypeCount}</span>
          </p>
        </div>
        <div
          data-testid="topology-node-popover-compact-actions"
          data-compact-actions-layout-contract="actions-after-facts"
          data-compact-actions-hierarchy-contract="primary-brief-then-quiet-chrome"
          data-compact-action-gap-token="--topology-node-popover-compact-action-gap"
          data-phone-layout-contract="actions-wrap-below-title"
          className="flex min-w-0 w-full items-center justify-end gap-[var(--topology-node-popover-compact-action-gap)]"
        >
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              aria-label={primaryAction.ariaLabel}
              title={primaryAction.label}
              data-testid="topology-node-popover-compact-brief-action"
              data-popover-action={primaryAction.kind}
              data-agent-handoff-action="copy-focus-brief"
              data-popover-action-label-contract="icon-only-full-aria-title"
              data-popover-action-full-label={primaryAction.label}
              data-popover-action-compact-label={compactActionLabel(primaryAction)}
              data-popover-action-responsive-label-contract="visible-above-480-icon-only-below"
              data-popover-action-surface-token="--topology-node-popover-action-icon-surface"
              data-popover-action-border-token="--topology-node-popover-action-icon-border"
              data-popover-action-text-token="--topology-node-popover-action-text"
              data-popover-action-hover-text-token="--topology-node-popover-action-hover-text"
              data-popover-action-focus-ring-token="--topology-node-popover-action-focus-ring"
              data-popover-action-size-token="--topology-node-popover-compact-action-size"
              data-popover-action-gap-token="--topology-node-popover-compact-action-gap"
              data-popover-action-padding-x-token="--topology-node-popover-compact-action-padding-x"
              data-popover-action-min-width-token="--topology-node-popover-compact-handoff-action-min-width"
              data-popover-action-max-width-token="--topology-node-popover-compact-handoff-action-max-width"
              data-popover-action-label-size-token="--topology-node-popover-compact-action-label-size"
              className="inline-flex h-[var(--topology-node-popover-compact-action-size)] min-w-[var(--topology-node-popover-compact-handoff-action-min-width)] max-w-[var(--topology-node-popover-compact-handoff-action-max-width)] shrink-0 items-center justify-center gap-[var(--topology-node-popover-compact-action-gap)] overflow-hidden rounded-md border border-[color:var(--topology-node-popover-action-icon-border)] bg-[color:var(--topology-node-popover-action-icon-surface)] px-[var(--topology-node-popover-compact-action-padding-x)] text-[length:var(--topology-node-popover-compact-action-label-size)] text-[color:var(--topology-node-popover-action-text)] transition-colors hover:border-[color:var(--topology-node-popover-action-hover-border)] hover:text-[color:var(--topology-node-popover-action-hover-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-node-popover-action-focus-ring)] max-[480px]:w-[var(--topology-node-popover-compact-action-size)] max-[480px]:min-w-[var(--topology-node-popover-compact-action-size)] max-[480px]:px-0"
            >
              <Clipboard size={14} aria-hidden />
              <span className="min-w-0 truncate max-[480px]:sr-only">
                {compactActionLabel(primaryAction)}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={labels.expand}
            data-node-popover-toggle="expand"
            data-compact-action-contract="quiet-inline-disclosure"
            data-chrome-action-treatment="quiet-inline-disclosure"
            data-chrome-action-text-token="--topology-node-popover-chrome-action-text"
            data-chrome-action-hover-text-token="--topology-node-popover-chrome-action-hover-text"
            data-chrome-action-label-size-token="--topology-node-popover-compact-chrome-label-size"
            className="inline-flex h-[var(--topology-node-popover-compact-action-size)] shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[length:var(--topology-node-popover-compact-chrome-label-size)] text-[color:var(--topology-node-popover-chrome-action-text)] transition-colors hover:text-[color:var(--topology-node-popover-chrome-action-hover-text)] max-[480px]:w-[var(--topology-node-popover-compact-action-size)] max-[480px]:px-0"
          >
            <ChevronUp size={13} aria-hidden />
            <span className="max-[480px]:sr-only">{labels.expand}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            data-node-popover-close="true"
            data-chrome-action-text-token="--topology-node-popover-chrome-action-text"
            data-chrome-action-hover-text-token="--topology-node-popover-chrome-action-hover-text"
            className="shrink-0 rounded-md p-1 text-[color:var(--topology-node-popover-chrome-action-text)] transition-colors hover:text-[color:var(--topology-node-popover-chrome-action-hover-text)]"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={expandedShellRef}
      role="dialog"
      tabIndex={-1}
      aria-label={focus.title}
      {...selectedNodeAttributes}
      data-testid="topology-node-popover"
      data-topology-node-popover="selected-node-inspector"
      data-node-popover-shell-contract="selected-node-inspector-shell"
      data-surface-role="active-node-inspector"
      data-attention-role="supporting-detail"
      data-focus-primary="linked-focus-cluster"
      data-hierarchy-contract="click-focus-detail-support"
      data-density="readable"
      data-size-policy="inspector-rail"
      data-width-token="--topology-node-popover-fluid-width"
      data-rail-width-token="--topology-node-popover-rail-width"
      data-max-height-token="--topology-node-popover-max-height"
      data-popover-surface-token="--topology-node-popover-surface"
      data-popover-border-token="--topology-node-popover-border"
      data-title-lines-token="--topology-node-popover-title-lines"
      data-responsive-width-contract="fluid-inspector-to-rail"
      data-popover-scroll-contract="expanded-internal-scroll"
      data-compact-handoff-contract={handoffContract}
      data-title-readability-contract="selected-node-title-readable"
      data-expanded-focus-contract="expanded-shell-focus-anchor"
      data-expanded-shell-focus="programmatic-no-visible-row-state"
      data-section-spacing-contract="shared-inset-and-rhythm-tokens"
      data-section-padding-x-token="--topology-node-popover-section-padding-x"
      data-section-gap-token="--topology-node-popover-section-gap"
      data-compact-section-gap-token="--topology-node-popover-compact-section-gap"
      className={`flex max-h-[var(--topology-node-popover-max-height)] min-w-0 w-[var(--topology-node-popover-fluid-width)] max-w-[var(--topology-node-popover-fluid-width)] flex-col overflow-hidden rounded-[var(--topology-node-popover-radius)] border border-[color:var(--topology-node-popover-border)] bg-[color:var(--topology-node-popover-surface)] shadow-[var(--topology-node-popover-shadow)] outline-none lg:w-[var(--topology-node-popover-rail-width)] lg:max-w-[var(--topology-node-popover-rail-width)] ${className ?? ""}`}
    >
      <div
        data-testid="topology-node-popover-body"
        data-body-scroll-contract="content-scrolls-above-fixed-footer"
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
      <header
        data-node-popover-section="header"
        data-section-padding-x-token="--topology-node-popover-section-padding-x"
        data-header-padding-top-token="--topology-node-popover-header-padding-top"
        data-header-gap-token="--topology-node-popover-header-gap"
        className="flex items-start justify-between gap-[var(--topology-node-popover-header-gap)] px-[var(--topology-node-popover-section-padding-x)] pt-[var(--topology-node-popover-header-padding-top)]"
      >
        <div className="min-w-0">
          <p
            data-selected-node-kind-label
            data-kind-text-token="--topology-node-popover-kind-text"
            data-kind-size-token="--topology-node-popover-kind-size"
            className="font-mono text-[length:var(--topology-node-popover-kind-size)] uppercase tracking-[0.12em] text-[color:var(--topology-node-popover-kind-text)]"
          >
            {focusKindLabel}
          </p>
          <h2
            data-testid="topology-node-popover-title"
            data-title-readability-contract="selected-node-title-readable"
            data-title-lines-token="--topology-node-popover-title-lines"
            data-title-text-token="--topology-node-popover-title-text"
            data-title-size-token="--topology-node-popover-title-size"
            data-title-leading-token="--topology-node-popover-title-leading"
            className="mt-0.5 line-clamp-[var(--topology-node-popover-title-lines)] text-[length:var(--topology-node-popover-title-size)] font-[var(--font-weight-signature)] leading-[var(--topology-node-popover-title-leading)] text-[color:var(--topology-node-popover-title-text)]"
          >
            {focus.title}
          </h2>
          <p
            data-selected-node-count-line
            data-count-text-token="--topology-node-popover-count-text"
            data-count-size-token="--topology-node-popover-count-size"
            className="mt-0.5 truncate text-[length:var(--topology-node-popover-count-size)] text-[color:var(--topology-node-popover-count-text)]"
          >
            {labels.usedBy} {focus.usedByCount} · {labels.dependsOn} {focus.dependsOnCount}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          data-node-popover-close="true"
          data-chrome-action-text-token="--topology-node-popover-chrome-action-text"
          data-chrome-action-hover-text-token="--topology-node-popover-chrome-action-hover-text"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[color:var(--topology-node-popover-chrome-action-text)] transition-colors hover:text-[color:var(--topology-node-popover-chrome-action-hover-text)]"
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      {significance ? (
        <div
          data-testid="topology-node-significance"
          data-node-popover-section="significance"
          data-section-padding-x-token="--topology-node-popover-section-padding-x"
          data-compact-section-gap-token="--topology-node-popover-compact-section-gap"
          data-phone-density-contract="keep-primary-meaning-before-readable-row"
          data-meaning-order-contract="before-raw-summary"
          data-significance-layout="primary-meaning-only"
          data-visible-density-contract="primary-meaning-only-preserve-details-for-agents"
          data-significance-gap-token="--topology-node-popover-significance-gap"
          data-phone-section-gap-token="--topology-node-popover-phone-section-gap"
          className="mt-[var(--topology-node-popover-compact-section-gap)] flex flex-col gap-[var(--topology-node-popover-significance-gap)] px-[var(--topology-node-popover-section-padding-x)] max-[540px]:mt-[var(--topology-node-popover-phone-section-gap)]"
        >
          <p
            data-significance-context-line="what"
            data-significance-visibility="agent-context"
            data-significance-context-text-token="--topology-node-popover-significance-context-text"
            className="sr-only"
          >
            {significance.whatLine}
          </p>
          <p
            data-selected-node-importance-line
            data-significance-level={significance.level}
            data-importance-text-token={
              significance.level === "core"
                ? "--topology-node-popover-significance-core-text"
                : "--topology-node-popover-significance-support-text"
            }
            data-importance-size-token="--topology-node-popover-significance-size"
            data-importance-leading-token="--topology-node-popover-significance-leading"
            className={
              significance.level === "core"
                ? "line-clamp-2 text-[length:var(--topology-node-popover-significance-size)] leading-[var(--topology-node-popover-significance-leading)] font-[var(--font-weight-signature)] text-[color:var(--topology-node-popover-significance-core-text)]"
                : "line-clamp-2 text-[length:var(--topology-node-popover-significance-size)] leading-[var(--topology-node-popover-significance-leading)] text-[color:var(--topology-node-popover-significance-support-text)]"
            }
          >
            {significance.importanceLine}
          </p>
          <p
            data-significance-detail-line="depends-on"
            data-significance-visibility="agent-context"
            data-significance-detail-text-token="--topology-node-popover-significance-detail-text"
            className="sr-only"
          >
            {significance.dependsOnLine}
          </p>
          <p
            data-significance-detail-line="impact"
            data-significance-visibility="agent-context"
            data-significance-detail-text-token="--topology-node-popover-significance-detail-text"
            className="sr-only"
          >
            {significance.impactLine}
          </p>
        </div>
      ) : null}

      {focus.summary ? (
        <p
          data-phone-density-contract="hide-summary-before-readable-row"
          data-summary-role="raw-supporting-note"
          data-summary-order-contract={significance ? "after-meaning" : "primary-when-no-meaning"}
          data-summary-visibility={significance ? "metadata-only" : "visible"}
          data-summary-text-token="--topology-node-popover-summary-text"
          data-summary-size-token="--topology-node-popover-summary-size"
          data-summary-leading-token="--topology-node-popover-summary-leading"
          data-section-padding-x-token="--topology-node-popover-section-padding-x"
          className={
            significance
              ? "sr-only"
              : "mt-[var(--topology-node-popover-significance-gap)] line-clamp-1 px-[var(--topology-node-popover-section-padding-x)] text-[length:var(--topology-node-popover-summary-size)] leading-[var(--topology-node-popover-summary-leading)] text-[color:var(--topology-node-popover-summary-text)] max-[540px]:hidden"
          }
        >
          {focus.summary}
        </p>
      ) : null}

      <div
        data-node-popover-section="metrics"
        data-section-padding-x-token="--topology-node-popover-section-padding-x"
        data-section-gap-token="--topology-node-popover-section-gap"
        data-metric-gap-token="--topology-node-popover-metric-gap"
        className="mt-[var(--topology-node-popover-section-gap)] grid grid-cols-2 gap-[var(--topology-node-popover-metric-gap)] px-[var(--topology-node-popover-section-padding-x)]"
      >
        <Stat label={labels.usedBy} value={focus.usedByCount} />
        <Stat label={labels.dependsOn} value={focus.dependsOnCount} />
      </div>

      <div
        data-testid="topology-connections-section"
        data-overflow-contract="single-vertical-scroll-region"
        data-readable-list-budget="two-relation-preview-primary-scroll"
        data-relation-section-min-height-token="--topology-node-popover-relation-section-min-height"
        data-relation-section-border-token="--topology-node-popover-relation-section-border"
        data-relation-section-title-text-token="--topology-node-popover-relation-section-title-text"
        data-relation-section-lens-text-token="--topology-node-popover-relation-section-lens-text"
        data-section-padding-x-token="--topology-node-popover-section-padding-x"
        data-compact-section-gap-token="--topology-node-popover-compact-section-gap"
        data-relation-section-padding-y-token="--topology-node-popover-relation-section-padding-y"
        className="mt-[var(--topology-node-popover-compact-section-gap)] flex min-h-[var(--topology-node-popover-relation-section-min-height)] flex-1 flex-col overflow-hidden border-t border-[color:var(--topology-node-popover-relation-section-border)] px-[var(--topology-node-popover-section-padding-x)] py-[var(--topology-node-popover-relation-section-padding-y)]"
      >
        <p
          data-relation-section-title="connections"
          data-relation-section-title-margin-bottom-token="--topology-node-popover-relation-section-title-margin-bottom"
          data-relation-section-title-size-token="--topology-node-popover-relation-section-title-size"
          className="mb-[var(--topology-node-popover-relation-section-title-margin-bottom)] font-mono text-[length:var(--topology-node-popover-relation-section-title-size)] uppercase tracking-[0.12em] text-[color:var(--topology-node-popover-relation-section-title-text)]"
        >
          {labels.connections} ({total})
        </p>
        <div
          data-testid="topology-relation-lens"
          data-relation-section-lens="typed-fact-summary"
          data-relation-lens-density-contract="quiet-inline-fact-strip"
          data-relation-lens-layout="inline-label-value-metrics"
          data-phone-density-contract="hide-explainer-before-readable-row"
          data-relation-fact-label={relationFactLabel}
          data-relation-type-label={relationTypeLabel}
          data-relation-lens-gap-token="--topology-node-popover-relation-lens-gap"
          data-relation-lens-metric-gap-token="--topology-node-popover-relation-lens-metric-gap"
          data-relation-lens-metric-min-width-token="--topology-node-popover-relation-lens-metric-min-width"
          data-relation-lens-margin-bottom-token="--topology-node-popover-relation-lens-margin-bottom"
          data-relation-lens-size-token="--topology-node-popover-relation-lens-size"
          data-relation-lens-leading-token="--topology-node-popover-relation-lens-leading"
          aria-label={`${labels.relationLensTitle}: ${relationFactLabel} · ${relationTypeLabel} · ${labels.relationLensNoScores}`}
          title={`${labels.relationLensTitle}: ${relationFactLabel} · ${relationTypeLabel} · ${labels.relationLensNoScores}`}
          className="mb-[var(--topology-node-popover-relation-lens-margin-bottom)] flex items-center justify-between gap-[var(--topology-node-popover-relation-lens-gap)] text-[length:var(--topology-node-popover-relation-lens-size)] leading-[var(--topology-node-popover-relation-lens-leading)] text-[color:var(--topology-node-popover-relation-section-lens-text)] max-[540px]:hidden"
        >
          <span className="min-w-0 truncate font-mono uppercase tracking-[0.08em]">
            {labels.relationLensTitle}
          </span>
          <span
            data-relation-lens-metric="facts"
            className="inline-flex min-w-[var(--topology-node-popover-relation-lens-metric-min-width)] items-center justify-end gap-[var(--topology-node-popover-relation-lens-metric-gap)] whitespace-nowrap font-mono"
          >
            <span className="uppercase tracking-[0.08em]">
              {labels.relationLensCompactFacts}
            </span>
            <span className="tabular-nums text-[color:var(--topology-node-popover-title-text)]">
              {total}
            </span>
          </span>
          <span
            data-relation-lens-metric="types"
            className="inline-flex min-w-[var(--topology-node-popover-relation-lens-metric-min-width)] items-center justify-end gap-[var(--topology-node-popover-relation-lens-metric-gap)] whitespace-nowrap font-mono"
          >
            <span className="uppercase tracking-[0.08em]">
              {labels.relationLensCompactTypes}
            </span>
            <span className="tabular-nums text-[color:var(--topology-node-popover-title-text)]">
              {relationTypeCount}
            </span>
          </span>
        </div>
        <div
          data-testid="topology-relation-quality-lens"
          aria-label={`${labels.relationQualityTitle}: ${relationQualitySummary}`}
          data-relation-quality-summary={relationQualitySummary}
          data-relation-quality-meter-total={relationQualityMeterTotal}
          data-relation-quality-layout="screen-reader-summary"
          data-visible-density-contract="screen-reader-only-preserve-summary-for-agents"
          className="sr-only"
        >
          <div
            aria-hidden="true"
            data-testid="topology-node-relation-quality-meter"
            data-quality-meter-contract="distribution-bar-maps-relation-quality"
            data-surface-token="--topology-overview-quality-meter-surface"
            data-border-token="--topology-overview-quality-meter-border"
            className="mb-1 flex h-0.5 w-full overflow-hidden rounded-full bg-[color:var(--topology-overview-quality-meter-surface)]"
          >
            {relationQualityMeterItems.map((segment) => (
              <span
                key={segment.key}
                data-relation-quality-meter-segment={segment.key}
                data-count={segment.count}
                data-meter-token={segment.token}
                style={{
                  background: `var(${segment.token})`,
                  flexGrow:
                    relationQualityMeterTotal > 0 ? segment.count : 1,
                }}
              />
            ))}
          </div>
          <p
            data-relation-quality-summary-line
            className="sr-only"
          >
            {relationQualityItems.map(({ quality, label, count }) => (
              <span
                key={quality}
                data-relation-quality-chip={quality}
                data-relation-quality-surface-token={relationQualityChipToken(
                  quality,
                  "surface",
                )}
                data-relation-quality-border-token={relationQualityChipToken(
                  quality,
                  "border",
                )}
                data-relation-quality-text-token={relationQualityChipToken(
                  quality,
                  "text",
                )}
                className="inline text-[color:var(--topology-node-popover-relation-section-lens-text)]"
              >
                <span className="uppercase tracking-[0.04em]">{label}</span>
                <span className="ml-1 tabular-nums">{count}</span>
                {quality === "review" ? null : (
                  <span
                    aria-hidden="true"
                    className="mx-1 text-[color:var(--topology-node-popover-endpoint-separator)]"
                  >
                    ·
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
        <div
          data-testid="topology-node-agent-readiness-lens"
          aria-label={`${labels.agentReadinessTitle}: ${agentReadinessSummary}`}
          data-agent-readiness-summary={agentReadinessSummary}
          data-agent-readiness-layout="screen-reader-summary"
          data-visible-density-contract="screen-reader-only-preserve-summary-for-agents"
          className="sr-only"
        >
          <div
            aria-hidden="true"
            data-testid="topology-node-agent-readiness-meter"
            data-agent-readiness-meter-contract="distribution-bar-maps-agent-readiness"
            data-agent-readiness-meter-total={agentReadinessMeterTotal}
            data-surface-token="--topology-overview-readiness-meter-surface"
            data-border-token="--topology-overview-readiness-meter-border"
            className="mb-1 flex h-0.5 w-full overflow-hidden rounded-full bg-[color:var(--topology-overview-readiness-meter-surface)]"
          >
            {agentReadinessMeterItems.map((segment) => (
              <span
                key={segment.key}
                data-agent-readiness-meter-segment={segment.key}
                data-count={segment.count}
                data-meter-token={segment.token}
                style={{
                  background: `var(${segment.token})`,
                  flexGrow:
                    agentReadinessMeterTotal > 0 ? segment.count : 1,
                }}
              />
            ))}
          </div>
          <p
            data-agent-readiness-summary-line
            className="sr-only"
          >
            <span
              data-agent-readiness-title
              className="uppercase tracking-[0.04em] text-[color:var(--topology-node-popover-relation-section-title-text)]"
            >
              {labels.agentReadinessTitle}
            </span>
            <span
              aria-hidden="true"
              className="mx-1 text-[color:var(--topology-node-popover-endpoint-separator)]"
            >
              ·
            </span>
            {agentReadinessItems.map(({ key, label, displayLabel, count }) => (
              <span
                key={key}
                data-agent-readiness-chip={key}
                data-count={count}
                data-agent-readiness-label-contract="compact-visible-full-aria"
                data-agent-readiness-full-label={label}
                data-agent-readiness-compact-label={displayLabel}
                data-agent-readiness-surface-token={agentReadinessToken(
                  key,
                  "surface",
                )}
                data-agent-readiness-border-token={agentReadinessToken(key, "border")}
                data-agent-readiness-text-token={agentReadinessToken(key, "text")}
                title={`${label} ${count}`}
                className="inline text-[color:var(--topology-node-popover-relation-section-lens-text)]"
              >
                <span className="uppercase tracking-[0.04em]">{displayLabel}</span>
                <span className="ml-1 tabular-nums">{count}</span>
                {key === "review" ? null : (
                  <span
                    aria-hidden="true"
                    className="mx-1 text-[color:var(--topology-node-popover-endpoint-separator)]"
                  >
                    ·
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
        {expandedCount > 0 ? (
          <p
            data-testid="topology-map-context-note"
            data-map-context-count={expandedCount}
            data-map-context-contract="expanded-relations-stay-on-map"
            data-map-context-handoff-contract="map-visible-relations-summarized"
            data-map-context-relation-type-count={expandedRelationTypeCount}
            data-map-context-quality-summary={expandedRelationQualitySummary}
            data-map-context-agent-readiness-summary={expandedAgentReadinessSummary}
            data-phone-density-contract="defer-map-context-before-readable-row"
            data-map-context-visual-contract="screen-reader-map-context-summary"
            data-visible-density-contract="preserve-map-context-for-agents-without-visible-note"
            data-map-context-text-token="--topology-node-popover-relation-section-lens-text"
            className="sr-only"
          >
            {labels.expandedNote.replace("{count}", String(expandedCount))}
          </p>
        ) : null}
        {renderedConnections.length > 0 ? (
          <ul
            data-testid="topology-node-connection-list"
            data-overflow-contract="vertical-scroll-only"
            data-row-density-contract="agent-handoff-scan-list"
            data-readable-row-contract="at-least-one-full-relation-row"
            data-row-min-hit-height="72"
            data-relation-list-min-height-token="--topology-node-popover-relation-list-min-height"
            data-row-render-contract="capped-preview-plus-remainder"
            data-row-render-source={relationPreviewSource}
            data-row-render-budget={NODE_POPOVER_RELATION_ROW_RENDER_BUDGET}
            data-rendered-connection-count={renderedConnections.length}
            data-hidden-connection-count={hiddenConnectionCount}
            data-total-connection-count={total}
            data-row-surface-contract="flat-divider-rail"
            data-relation-list-surface-token="--topology-node-popover-relation-list-surface"
            data-relation-list-border-token="--topology-node-popover-relation-list-border"
            data-relation-row-divider-token="--topology-node-popover-relation-row-divider"
            data-relation-row-hover-surface-token="--topology-node-popover-relation-row-hover-surface"
            className="flex min-h-[var(--topology-node-popover-relation-list-min-height)] flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-md bg-[color:var(--topology-node-popover-relation-list-surface)] ring-1 ring-[color:var(--topology-node-popover-relation-list-border)]"
          >
            {renderedConnections.map((connection, index) => {
              const directionLabel =
                connection.direction === "outgoing" ? labels.dependsOn : labels.usedBy;
              const relationTypeLabel =
                labels.relationTypeLabels[connection.relationType] ??
                connection.relationType;
              const kindLabel = labels.kindLabels[connection.kind] ?? connection.kind;
              const evidenceState = relationEvidenceState(connection);
              const agentGateKind = relationAgentGateKind(connection);
              const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
              const relationSourceId =
                connection.direction === "outgoing" ? focus.id : connection.id;
              const relationTargetId =
                connection.direction === "outgoing" ? connection.id : focus.id;
              const agentGateChipText = labels.agentGateChipLabels[agentGateKind];
              const primaryCopyActionShortLabel =
                labels.relationCopyActionChipLabels[primaryCopyAction];
              const relationHandoffSummary = [
                `${relationSourceId} > ${relationTargetId}`,
                relationTypeLabel,
                evidenceState,
                agentGateKind,
                primaryCopyAction,
              ].join(" · ");
              const relationAccessibleHandoffSummary = [
                relationTypeLabel,
                relationEvidenceGlyph(connection),
                primaryCopyActionShortLabel,
              ].join(" · ");
              const relationReadableProofLabel = `${labels.relationEvidenceChipLabel} ${relationEvidenceGlyph(connection)}`;
              const relationReadableSummary = [
                `${directionLabel} · ${kindLabel}`,
                relationTypeLabel,
                relationReadableProofLabel,
              ].join(" · ");
              const relationHandoffTool = "query_ontology";
              const relationHandoffPayloadSummary = [
                relationHandoffTool,
                primaryCopyAction,
                `${relationSourceId} -> ${relationTargetId}`,
                connection.relationType,
              ].join(" · ");
              const relationHandoffPayloadJson = JSON.stringify({
                tool: relationHandoffTool,
                operation: primaryCopyAction,
                from: relationSourceId,
                to: relationTargetId,
                type: connection.relationType,
              });
              const relationAccessibleSummary = [
                relationTypeLabel,
                connection.title,
                directionLabel,
                kindLabel,
                relationAccessibleHandoffSummary,
              ].join(" · ");
              return (
                <li
                  key={`${connection.id}-${connection.direction}-${index}`}
                  className="border-b border-[color:var(--topology-node-popover-relation-row-divider)] last:border-b-0"
                >
                  <button
                    type="button"
                    aria-label={relationAccessibleSummary}
                    data-relation-row
                    data-expanded-focus-entry={
                      index === 0 ? "first-readable-relation-row" : undefined
                    }
                    data-relation-direction={connection.direction}
                    data-relation-type={connection.relationType}
                    data-relation-quality={connection.relationQuality}
                    data-relation-evidence-state={evidenceState}
                    data-relation-evidence-count={connection.evidenceCount}
                    data-agent-gate-kind={agentGateKind}
                    data-primary-copy-action={primaryCopyAction}
                    data-relation-row-action-contract="inspect-relation-and-copy-handoff"
                    data-relation-fact-route="fact>evidence>gate>action"
                    data-handoff-grammar-contract="fact-evidence-gate-action-payload"
                    data-relation-fact-route-quality={connection.relationQuality}
                    data-relation-fact-route-evidence={evidenceState}
                    data-relation-fact-route-gate={agentGateKind}
                    data-relation-fact-route-action={primaryCopyAction}
                    data-relation-source-id={relationSourceId}
                    data-relation-target-id={relationTargetId}
                    data-relation-endpoint-route={`${relationSourceId}>${relationTargetId}`}
                    data-relation-handoff-summary={relationHandoffSummary}
                    data-relation-readable-summary={relationReadableSummary}
                    data-relation-handoff-tool={relationHandoffTool}
                    data-relation-handoff-operation={primaryCopyAction}
                    data-relation-handoff-from={relationSourceId}
                    data-relation-handoff-to={relationTargetId}
                    data-relation-handoff-type={connection.relationType}
                    data-relation-handoff-payload-summary={relationHandoffPayloadSummary}
                    data-relation-handoff-payload-json={relationHandoffPayloadJson}
                    data-overflow-contract="no-horizontal-scroll"
                    data-row-density-contract="agent-handoff-scan-row"
                    data-row-render-source={relationPreviewSource}
                    data-row-surface-contract="flat-divider-row"
                    data-row-visual-contract="title-relation-proof-action"
                    data-row-min-hit-height="72"
                    data-row-min-height-token="--topology-node-popover-relation-row-min-height"
                    data-row-gap-token="--topology-node-popover-relation-row-gap"
                    data-row-padding-x-token="--topology-node-popover-relation-row-padding-x"
                    data-row-padding-y-token="--topology-node-popover-relation-row-padding-y"
                    data-row-scan-order="title>relation>kind"
                    data-row-emphasis-contract="visible-proof-action-microchips"
                    data-row-hover-surface-token="--topology-node-popover-relation-row-hover-surface"
                    data-row-focus-surface-token="--topology-node-popover-relation-row-focus-surface"
                    data-row-focus-border-token="--topology-node-popover-relation-row-focus-border"
                    data-row-focus-ring-token="--topology-node-popover-relation-row-focus-ring"
                    data-row-state-layer-contract="quiet-hover-keyboard-outline"
                    onClick={() => onSelectConnection(connection.id)}
                    className="group relative flex min-h-[var(--topology-node-popover-relation-row-min-height)] w-full min-w-0 items-stretch gap-[var(--topology-node-popover-relation-row-gap)] overflow-hidden border border-transparent bg-transparent px-[var(--topology-node-popover-relation-row-padding-x)] py-[var(--topology-node-popover-relation-row-padding-y)] text-left transition-[background-color,border-color,box-shadow] hover:bg-[color:var(--topology-node-popover-relation-row-hover-surface)] focus-visible:border-[color:var(--topology-node-popover-relation-row-focus-border)] focus-visible:bg-[color:var(--topology-node-popover-relation-row-focus-surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--topology-node-popover-relation-row-focus-ring)]"
                  >
                    <span
                      data-relation-direction-marker={connection.direction}
                      data-direction-text-token="--topology-node-popover-relation-row-meta-text"
                      data-direction-marker-contract="inline-relation-direction-glyph"
                      data-direction-offset-token="--topology-node-popover-relation-direction-offset"
                      data-direction-size-token="--topology-node-popover-relation-direction-size"
                      className="mt-[var(--topology-node-popover-relation-direction-offset)] inline-flex h-[var(--topology-node-popover-relation-direction-size)] w-[var(--topology-node-popover-relation-direction-size)] shrink-0 items-center justify-center text-[color:var(--topology-node-popover-relation-row-meta-text)] opacity-70 transition-opacity group-hover:opacity-90"
                    >
                      {connection.direction === "outgoing" ? (
                        <ArrowUpRight size={12} aria-hidden />
                      ) : (
                        <ArrowDownLeft size={12} aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        data-relation-primary-line
                        data-visible-contract="connected-title-only"
                        className="flex min-w-0 items-center"
                      >
                        <span
                          data-relation-title
                          data-primary-scan-target="true"
                          data-relation-title-text-token="--topology-node-popover-relation-row-title-text"
                          data-relation-title-size-token="--topology-node-popover-relation-row-title-size"
                          className="min-w-0 truncate text-[length:var(--topology-node-popover-relation-row-title-size)] font-[var(--font-weight-signature)] text-[color:var(--topology-node-popover-relation-row-title-text)]"
                        >
                          {connection.title}
                        </span>
                      </span>
                      <span
                        data-relation-row-meta
                        data-row-meta-text-token="--topology-node-popover-relation-row-meta-text"
                        data-row-meta-size-token="--topology-node-popover-relation-row-meta-size"
                        data-row-meta-leading-token="--topology-node-popover-relation-row-meta-leading"
                        data-row-meta-gap-x-token="--topology-node-popover-relation-row-meta-gap-x"
                        data-row-meta-gap-y-token="--topology-node-popover-relation-row-meta-gap-y"
                        data-visible-contract="relation-facts-secondary-to-connected-title"
                        data-readable-summary-contract="plain-language-proof-before-machine-route"
                        className="mt-[var(--topology-node-popover-remainder-margin-top)] flex min-w-0 flex-wrap items-center gap-x-[var(--topology-node-popover-relation-row-meta-gap-x)] gap-y-[var(--topology-node-popover-relation-row-meta-gap-y)] text-[length:var(--topology-node-popover-relation-row-meta-size)] leading-[var(--topology-node-popover-relation-row-meta-leading)] text-[color:var(--topology-node-popover-relation-row-meta-text)]"
                      >
                        <span
                          data-relation-type-label
                          data-fact-type-surface-token="--topology-node-popover-fact-type-surface"
                          data-fact-type-border-token="--topology-node-popover-fact-type-border"
                          data-fact-type-text-token="--topology-node-popover-fact-type-text"
                          data-fact-type-max-width-token="--topology-node-popover-relation-type-max-width"
                          data-fact-type-size-token="--topology-node-popover-relation-type-size"
                          data-fact-type-leading-token="--topology-node-popover-relation-type-leading"
                          data-relation-pill-contract="plain-inline-typed-fact-label"
                          data-visible-contract="relation-type-belongs-to-secondary-facts"
                          className="max-w-[var(--topology-node-popover-relation-type-max-width)] shrink-0 truncate font-mono text-[length:var(--topology-node-popover-relation-type-size)] leading-[var(--topology-node-popover-relation-type-leading)] text-[color:var(--topology-node-popover-fact-type-text)]"
                        >
                          {relationTypeLabel}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[color:var(--topology-node-popover-endpoint-separator)]"
                        >
                          {" · "}
                        </span>
                        <span
                          data-relation-row-context
                          data-visible-contract="connected-kind-secondary-to-typed-fact"
                          className="min-w-0 truncate"
                        >
                          {kindLabel}
                        </span>
                        <span
                          aria-hidden="true"
                          data-relation-row-agent-separator
                          data-visible-contract="proof-action-chips-own-visible-separators"
                          className="sr-only"
                        >
                          {" · "}
                        </span>
                        <span
                          data-relation-quality-dot
                          data-dot-token={relationQualityDotToken(connection.relationQuality)}
                          data-relation-quality-state-contract="semantic-sr-only"
                          aria-label={labels.relationQualityLabels[connection.relationQuality]}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          data-relation-evidence-glyph={evidenceState}
                          data-relation-readable-proof={relationReadableProofLabel}
                          data-visible-contract="proof-chip-visible-with-secondary-facts"
                          data-row-chip-height-token="--topology-node-popover-row-chip-height"
                          data-row-chip-padding-x-token="--topology-node-popover-row-chip-padding-x"
                          data-row-chip-text-size-token="--topology-node-popover-row-chip-text-size"
                          data-evidence-surface-token={relationEvidenceToken(
                            evidenceState,
                            "surface",
                          )}
                          data-evidence-border-token={relationEvidenceToken(
                            evidenceState,
                            "border",
                          )}
                          data-evidence-text-token={relationEvidenceToken(
                            evidenceState,
                            "text",
                          )}
                          className={`inline-flex h-[var(--topology-node-popover-row-chip-height)] shrink-0 items-center rounded border px-[var(--topology-node-popover-row-chip-padding-x)] font-mono text-[length:var(--topology-node-popover-row-chip-text-size)] leading-none ${relationEvidenceGlyphClassName(evidenceState)}`}
                        >
                          {labels.relationEvidenceChipLabel} {relationEvidenceGlyph(connection)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[color:var(--topology-node-popover-endpoint-separator)]"
                        >
                          {" · "}
                        </span>
                        <span
                          aria-hidden="true"
                          data-relation-row-agent-gate={agentGateKind}
                          data-visible-contract="agent-action-chip-visible-with-secondary-facts"
                          data-primary-copy-action={primaryCopyAction}
                          data-relation-row-action-chip={primaryCopyAction}
                          data-route-chip-text={primaryCopyActionShortLabel}
                          data-agent-gate-label={agentGateChipText}
                          data-row-chip-height-token="--topology-node-popover-row-chip-height"
                          data-row-chip-padding-x-token="--topology-node-popover-row-chip-padding-x"
                          data-row-chip-text-size-token="--topology-node-popover-row-chip-text-size"
                          data-agent-gate-surface-token={relationAgentGateToken(
                            agentGateKind,
                            "surface",
                          )}
                          data-agent-gate-border-token={relationAgentGateToken(
                            agentGateKind,
                            "border",
                          )}
                          data-agent-gate-text-token={relationAgentGateToken(
                            agentGateKind,
                            "text",
                          )}
                          title={agentGateChipText}
                          className={`inline-flex h-[var(--topology-node-popover-row-chip-height)] shrink-0 items-center rounded border px-[var(--topology-node-popover-row-chip-padding-x)] font-mono text-[length:var(--topology-node-popover-row-chip-text-size)] leading-none ${relationAgentGateChipClassName(agentGateKind)}`}
                        >
                          {primaryCopyActionShortLabel}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        data-relation-endpoint-route-label
                        data-visible-contract="machine-route-hidden-from-default-row"
                        data-endpoint-route-text-token="--topology-node-popover-endpoint-text"
                        data-endpoint-chip-text-token="--topology-node-popover-endpoint-chip-text"
                        data-endpoint-separator-token="--topology-node-popover-endpoint-separator"
                        className="sr-only"
                      >
                        <span
                          data-relation-endpoint-chip="source"
                          className="min-w-0 truncate text-[color:var(--topology-node-popover-endpoint-chip-text)]"
                        >
                          {relationSourceId}
                        </span>
                        <span className="shrink-0 font-mono text-[color:var(--topology-node-popover-endpoint-separator)]">
                          &gt;
                        </span>
                        <span
                          data-relation-endpoint-chip="target"
                          className="min-w-0 truncate text-[color:var(--topology-node-popover-endpoint-chip-text)]"
                        >
                          {relationTargetId}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        data-relation-route
                        data-relation-route-state="compact-json-ready"
                        data-relation-payload-layout="plain-next-action-line"
                        data-handoff-lane="mcp-cli-next-action"
                        data-handoff-grammar-contract="fact-evidence-gate-action-payload"
                        data-route-surface-token="--topology-node-popover-route-surface"
                        data-route-border-token="--topology-node-popover-route-border"
                        data-route-chip-surface-token="--topology-node-popover-route-chip-surface"
                        data-route-chip-border-token="--topology-node-popover-route-chip-border"
                        data-route-text-token="--topology-node-popover-route-text"
                        data-route-chip-text-token="--topology-node-popover-route-chip-text"
                        data-route-separator-token="--topology-node-popover-route-separator"
                        className="sr-only"
                      >
                        <span
                          data-relation-route-chip="fact"
                          className="sr-only"
                        >
                          {relationTypeLabel}
                        </span>
                        <span className="sr-only">
                          &gt;
                        </span>
                        <span
                          data-relation-route-chip="evidence"
                          className="shrink-0 text-[color:var(--topology-node-popover-route-chip-text)]"
                        >
                          {labels.relationEvidenceChipLabel} {relationEvidenceGlyph(connection)}
                        </span>
                        <span className="shrink-0 text-[color:var(--topology-node-popover-route-separator)]">
                          ·
                        </span>
                        <span
                          data-relation-route-chip="gate"
                          className="sr-only"
                        >
                          {agentGateChipText}
                        </span>
                        <span
                          data-relation-route-chip="action"
                          title={primaryCopyAction}
                          className="shrink-0 text-[color:var(--topology-node-popover-route-chip-text)]"
                        >
                          {primaryCopyActionShortLabel}
                        </span>
                        <span
                          data-relation-route-chip="payload"
                          data-relation-payload-summary={relationHandoffPayloadSummary}
                          data-visible-contract="machine-payload-hidden-from-default-row"
                          title={relationHandoffPayloadSummary}
                          className="sr-only"
                        >
                          {labels.relationPayloadChipLabel}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : expandedCount === 0 ? (
          <p
            data-relation-empty-state
            data-empty-text-token="--topology-node-popover-empty-text"
            data-empty-padding-x-token="--topology-node-popover-empty-padding-x"
            data-empty-padding-y-token="--topology-node-popover-empty-padding-y"
            data-empty-size-token="--topology-node-popover-empty-size"
            className="px-[var(--topology-node-popover-empty-padding-x)] py-[var(--topology-node-popover-empty-padding-y)] text-[length:var(--topology-node-popover-empty-size)] text-[color:var(--topology-node-popover-empty-text)]"
          >
            {labels.noConnections}
          </p>
        ) : null}
      {hiddenConnectionCount > 0 ? (
          <p
            data-relation-hidden-remainder
            data-remainder-text-token="--topology-node-popover-remainder-text"
            data-remainder-margin-top-token="--topology-node-popover-remainder-margin-top"
            data-remainder-padding-x-token="--topology-node-popover-remainder-padding-x"
            data-remainder-size-token="--topology-node-popover-remainder-size"
            className="mt-[var(--topology-node-popover-remainder-margin-top)] px-[var(--topology-node-popover-remainder-padding-x)] text-[length:var(--topology-node-popover-remainder-size)] text-[color:var(--topology-node-popover-remainder-text)]"
          >
            +{hiddenConnectionCount} {labels.moreSuffix}
          </p>
        ) : null}
      </div>
      </div>

      <footer
        data-testid="topology-node-popover-footer"
        data-footer-contract="fixed-outside-scroll-region"
        data-footer-position-contract="anchored-bottom-visible"
        data-overflow-contract="no-horizontal-scroll"
        data-popover-footer-surface-token="--topology-node-popover-footer-surface"
        data-popover-footer-border-token="--topology-node-popover-footer-border"
        data-popover-footer-padding-x-token="--topology-node-popover-footer-padding-x"
        data-popover-footer-padding-y-token="--topology-node-popover-footer-padding-y"
        data-footer-density-contract="compact-command-strip"
        data-footer-map-return-render-contract="small-screen-only-no-desktop-hidden-button"
        className="shrink-0 overflow-hidden border-t border-[color:var(--topology-node-popover-footer-border)] bg-[color:var(--topology-node-popover-footer-surface)] px-[var(--topology-node-popover-footer-padding-x)] py-[var(--topology-node-popover-footer-padding-y)]"
      >
        {actions.length > 0 ? (
          <div
            data-testid="topology-node-popover-action-rail"
            data-action-rail-contract="compact-mcp-cli-handoff"
            data-action-rail-action-gap-token="--topology-node-popover-action-rail-action-gap"
            data-action-rail-margin-bottom-token="--topology-node-popover-action-rail-margin-bottom"
            data-action-min-height-token="--topology-node-popover-action-min-height"
            data-action-count={actions.length}
            className="mb-[var(--topology-node-popover-action-rail-margin-bottom)] min-w-0 overflow-hidden"
          >
            <div
              data-agent-handoff-title-row="footer"
              data-agent-handoff-title-row-contract="screen-reader-handoff-context"
              className="sr-only"
            >
              <p
                data-agent-handoff-title="footer"
                className="sr-only"
              >
                {labels.actionRailTitle}
              </p>
              <span
                data-agent-handoff-title-hint="copy"
                className="sr-only"
              >
                {labels.actionRailHint}
              </span>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-[var(--topology-node-popover-action-rail-action-gap)] overflow-hidden">
              {actions.map((action) => {
                const actionIcon = nodePopoverActionIcon(action.kind);
                const Icon = actionIcon.Icon;
                return (
                  <button
                    key={action.kind}
                    type="button"
                    onClick={action.onClick}
                    aria-label={action.ariaLabel}
                    title={action.label}
                    data-popover-action={action.kind}
                    data-agent-handoff-action={action.kind}
                    data-popover-action-icon={actionIcon.marker}
                    data-popover-action-icon-contract="icon-marks-agent-handoff-kind"
                    data-popover-action-icon-token="--topology-node-popover-action-text"
                    data-popover-action-label-contract="compact-visible-full-aria"
                    data-popover-action-full-label={action.label}
                    data-popover-action-compact-label={compactActionLabel(action)}
                    data-popover-action-surface-token="--topology-node-popover-action-surface"
                    data-popover-action-border-token="--topology-node-popover-action-border"
                    data-popover-action-text-token="--topology-node-popover-action-text"
                    data-popover-action-hover-text-token="--topology-node-popover-action-hover-text"
                    data-popover-action-focus-ring-token="--topology-node-popover-action-focus-ring"
                    data-popover-action-gap-token="--topology-node-popover-action-gap"
                    data-popover-action-padding-x-token="--topology-node-popover-action-padding-x"
                    data-popover-action-padding-y-token="--topology-node-popover-action-padding-y"
                    data-popover-action-text-size-token="--topology-node-popover-action-text-size"
                    className="inline-flex min-h-[var(--topology-node-popover-action-min-height)] min-w-0 items-center justify-center gap-[var(--topology-node-popover-action-gap)] overflow-hidden rounded-md border border-[color:var(--topology-node-popover-action-border)] bg-[color:var(--topology-node-popover-action-surface)] px-[var(--topology-node-popover-action-padding-x)] py-[var(--topology-node-popover-action-padding-y)] text-[length:var(--topology-node-popover-action-text-size)] text-[color:var(--topology-node-popover-action-text)] transition-colors hover:border-[color:var(--topology-node-popover-action-hover-border)] hover:text-[color:var(--topology-node-popover-action-hover-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-node-popover-action-focus-ring)]"
                  >
                    <span
                      aria-hidden="true"
                      data-popover-action-icon-glyph={actionIcon.marker}
                      className="inline-flex shrink-0 text-[color:var(--topology-node-popover-action-text)]"
                    >
                      <Icon size={12} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 truncate">{compactActionLabel(action)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="flex min-w-0 gap-[var(--topology-node-popover-metric-gap)] overflow-hidden">
          {onToggleCollapsed && showCompactMapReturn ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={labels.collapse}
              data-node-popover-toggle="collapse"
              data-footer-action-border-token="--topology-node-popover-footer-action-border"
              data-footer-action-hover-border-token="--topology-node-popover-footer-action-hover-border"
              data-footer-action-text-token="--topology-node-popover-footer-action-text"
              data-footer-action-hover-text-token="--topology-node-popover-footer-action-hover-text"
              data-footer-action-min-height-token="--topology-node-popover-footer-secondary-action-min-height"
              data-footer-map-return-visibility="rendered-small-screen"
              data-footer-action-gap-token="--topology-node-popover-footer-action-gap"
              data-footer-action-padding-x-token="--topology-node-popover-footer-action-padding-x"
              data-footer-action-text-size-token="--topology-node-popover-footer-action-text-size"
              className="inline-flex min-h-[var(--topology-node-popover-footer-secondary-action-min-height)] min-w-0 max-w-[48%] shrink-0 items-center justify-center gap-[var(--topology-node-popover-footer-action-gap)] overflow-hidden whitespace-nowrap rounded-md border border-[color:var(--topology-node-popover-footer-action-border)] px-[var(--topology-node-popover-footer-action-padding-x)] text-[length:var(--topology-node-popover-footer-action-text-size)] text-[color:var(--topology-node-popover-footer-action-text)] transition-colors hover:border-[color:var(--topology-node-popover-footer-action-hover-border)] hover:text-[color:var(--topology-node-popover-footer-action-hover-text)]"
            >
              <ChevronDown size={14} aria-hidden />
              <span className="truncate">{labels.collapse}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenFullDetail}
            aria-label={fullDetailActionLabel}
            title={fullDetailActionLabel}
            data-footer-action="open-full-detail"
            data-footer-action-accessible-label-contract="full-detail-plus-hidden-remainder"
            data-footer-hidden-remainder-count={hiddenConnectionCount}
            data-footer-action-border-token="--topology-node-popover-footer-action-border"
            data-footer-action-hover-border-token="--topology-node-popover-footer-action-hover-border"
            data-footer-action-text-token="--topology-node-popover-footer-action-text"
            data-footer-action-hover-text-token="--topology-node-popover-footer-action-hover-text"
            data-footer-action-min-height-token="--topology-node-popover-footer-secondary-action-min-height"
            data-footer-action-gap-token="--topology-node-popover-footer-action-gap"
            data-footer-action-padding-x-token="--topology-node-popover-footer-action-padding-x"
            data-footer-action-padding-y-token="--topology-node-popover-footer-action-padding-y"
            data-footer-action-text-size-token="--topology-node-popover-footer-action-text-size"
            className="flex min-h-[var(--topology-node-popover-footer-secondary-action-min-height)] min-w-0 flex-1 items-center justify-center gap-[var(--topology-node-popover-footer-action-gap)] overflow-hidden rounded-md border border-[color:var(--topology-node-popover-footer-action-border)] px-[var(--topology-node-popover-footer-action-padding-x)] py-[var(--topology-node-popover-footer-action-padding-y)] text-[length:var(--topology-node-popover-footer-action-text-size)] text-[color:var(--topology-node-popover-footer-action-text)] transition-colors hover:border-[color:var(--topology-node-popover-footer-action-hover-border)] hover:text-[color:var(--topology-node-popover-footer-action-hover-text)]"
          >
            <span className="min-w-0 truncate">{labels.openFullDetail}</span>
            {hiddenConnectionCount > 0 ? (
              <span
                data-footer-hidden-count
                data-footer-count-border-token="--topology-node-popover-footer-count-border"
                data-footer-count-text-token="--topology-node-popover-footer-count-text"
                data-footer-count-padding-x-token="--topology-node-popover-footer-count-padding-x"
                data-footer-count-padding-y-token="--topology-node-popover-footer-count-padding-y"
                data-footer-count-size-token="--topology-node-popover-footer-count-size"
                className="shrink-0 whitespace-nowrap rounded-full border border-[color:var(--topology-node-popover-footer-count-border)] px-[var(--topology-node-popover-footer-count-padding-x)] py-[var(--topology-node-popover-footer-count-padding-y)] font-mono text-[length:var(--topology-node-popover-footer-count-size)] text-[color:var(--topology-node-popover-footer-count-text)]"
              >
                +{hiddenConnectionCount} {labels.moreSuffix}
              </span>
            ) : null}
            <ArrowUpRight size={13} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}

function compactNodePopoverActionLabel(
  kind: TopologyNodePopoverAction["kind"],
  label: string,
): string {
  const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(label);
  if (kind === "focus-brief") return hasKorean ? "브리프" : "Brief";
  if (kind === "mcp-profile") return hasKorean ? "프로필" : "Profile";
  return hasKorean ? "영향" : "Impact";
}

function nodePopoverActionIcon(kind: TopologyNodePopoverAction["kind"]): {
  Icon: LucideIcon;
  marker: "brief" | "node" | "impact";
} {
  if (kind === "focus-brief") return { Icon: FileText, marker: "brief" };
  if (kind === "mcp-profile") return { Icon: CircleDot, marker: "node" };
  return { Icon: Activity, marker: "impact" };
}

const relationQualityOrder: TopologyRelationQuality[] = [
  "strong",
  "supported",
  "weak",
  "review",
];

function relationQualityChipToken(
  quality: TopologyRelationQuality,
  slot: "surface" | "border" | "text",
): string {
  return `--topology-selected-relation-quality-${quality}-${slot}`;
}

function relationQualityDotToken(quality: TopologyRelationQuality): string {
  return `--topology-relation-quality-${quality}-dot`;
}

function agentReadinessToken(
  key: "ready" | "preflight" | "review",
  slot: "surface" | "border" | "text",
): string {
  return `--topology-node-popover-agent-${key}-${slot}`;
}

function compactAgentReadinessLabel(
  key: "ready" | "preflight" | "review",
  label: string,
): string {
  if (!/^[a-z][a-z -]*$/i.test(label.trim())) return label;
  if (key === "ready") return "ready";
  if (key === "preflight") return "check";
  return "review";
}

function relationEvidenceState({
  authored,
  evidenceCount,
}: {
  authored: boolean;
  evidenceCount: number;
}): RelationEvidenceState {
  if (evidenceCount > 0) return "source-backed";
  if (authored) return "authored";
  return "needs-review";
}

function relationEvidenceGlyph({
  evidenceCount,
  authored,
}: {
  evidenceCount: number;
  authored: boolean;
}): string {
  if (evidenceCount > 0) return evidenceCount > 9 ? "9+" : String(evidenceCount);
  if (authored) return "A";
  return "!";
}

function relationEvidenceGlyphClassName(evidenceState: RelationEvidenceState): string {
  if (evidenceState === "source-backed") {
    return "border-[color:var(--topology-node-popover-evidence-source-border)] bg-[color:var(--topology-node-popover-evidence-source-surface)] text-[color:var(--topology-node-popover-evidence-source-text)]";
  }
  if (evidenceState === "authored") {
    return "border-[color:var(--topology-node-popover-evidence-authored-border)] bg-[color:var(--topology-node-popover-evidence-authored-surface)] text-[color:var(--topology-node-popover-evidence-authored-text)]";
  }
  return "border-[color:var(--topology-node-popover-evidence-review-border)] bg-[color:var(--topology-node-popover-evidence-review-surface)] text-[color:var(--topology-node-popover-evidence-review-text)]";
}

function relationEvidenceToken(
  evidenceState: RelationEvidenceState,
  slot: "surface" | "border" | "text",
): string {
  if (evidenceState === "source-backed") {
    return `--topology-node-popover-evidence-source-${slot}`;
  }
  if (evidenceState === "authored") {
    return `--topology-node-popover-evidence-authored-${slot}`;
  }
  return `--topology-node-popover-evidence-review-${slot}`;
}

function relationAgentGateKind({
  authored,
  evidenceCount,
  relationQuality,
}: {
  authored: boolean;
  evidenceCount: number;
  relationQuality: TopologyRelationQuality;
}): RelationAgentGateKind {
  if (relationQuality === "review") return "review-first";
  if (relationQuality === "weak") return "preflight-first";
  if (evidenceCount > 0 || authored) return "handoff-ready";
  return "review-first";
}

function relationPrimaryCopyAction(gateKind: RelationAgentGateKind): RelationCopyActionKind {
  return gateKind === "handoff-ready" ? "explain_relation" : "relation_check";
}

function relationAgentGateChipClassName(gateKind: RelationAgentGateKind): string {
  if (gateKind === "handoff-ready") {
    return "border-[color:var(--topology-node-popover-gate-handoff-border)] bg-[color:var(--topology-node-popover-gate-handoff-surface)] text-[color:var(--topology-node-popover-gate-handoff-text)]";
  }
  if (gateKind === "preflight-first") {
    return "border-[color:var(--topology-node-popover-gate-preflight-border)] bg-[color:var(--topology-node-popover-gate-preflight-surface)] text-[color:var(--topology-node-popover-gate-preflight-text)]";
  }
  return "border-[color:var(--topology-node-popover-gate-review-border)] bg-[color:var(--topology-node-popover-gate-review-surface)] text-[color:var(--topology-node-popover-gate-review-text)]";
}

function relationAgentGateToken(
  gateKind: RelationAgentGateKind,
  slot: "surface" | "border" | "text",
): string {
  if (gateKind === "handoff-ready") {
    return `--topology-node-popover-gate-handoff-${slot}`;
  }
  if (gateKind === "preflight-first") {
    return `--topology-node-popover-gate-preflight-${slot}`;
  }
  return `--topology-node-popover-gate-review-${slot}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      data-node-popover-metric={label}
      data-metric-surface-token="--topology-node-popover-metric-surface"
      data-metric-border-token="--topology-node-popover-metric-border"
      data-metric-label-text-token="--topology-node-popover-metric-label-text"
      data-metric-value-text-token="--topology-node-popover-metric-value-text"
      data-metric-padding-x-token="--topology-node-popover-metric-padding-x"
      data-metric-padding-y-token="--topology-node-popover-metric-padding-y"
      className="rounded-lg border border-[color:var(--topology-node-popover-metric-border)] bg-[color:var(--topology-node-popover-metric-surface)] px-[var(--topology-node-popover-metric-padding-x)] py-[var(--topology-node-popover-metric-padding-y)]"
    >
      <p
        data-metric-label-size-token="--topology-node-popover-metric-label-size"
        data-metric-label-leading-token="--topology-node-popover-metric-label-leading"
        className="text-[length:var(--topology-node-popover-metric-label-size)] leading-[var(--topology-node-popover-metric-label-leading)] text-[color:var(--topology-node-popover-metric-label-text)]"
      >
        {label}
      </p>
      <p
        data-metric-value-size-token="--topology-node-popover-metric-value-size"
        className="mt-0.5 text-[length:var(--topology-node-popover-metric-value-size)] font-[var(--font-weight-signature)] text-[color:var(--topology-node-popover-metric-value-text)]"
      >
        {value}
      </p>
    </div>
  );
}
