"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, X } from "lucide-react";
import type { TopologyRelationQuality } from "../lib/topology-analysis";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import type { NodeSignificanceLevel } from "../lib/topology-node-significance";

type RelationEvidenceState = "source-backed" | "authored" | "needs-review";
type RelationAgentGateKind = "handoff-ready" | "preflight-first" | "review-first";
type RelationCopyActionKind = "explain_relation" | "relation_check";

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
  /** "{count}개는 왼쪽 지도에 펼쳐져 있어요" — 도킹 열과의 중복 안내. */
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
  /** "Typed ontology facts, not inferred similarity scores." */
  relationLensNoScores: string;
  /** "Relation quality" — edge confidence/provenance summary. */
  relationQualityTitle: string;
  relationQualityLabels: Record<TopologyRelationQuality, string>;
  /** "Agent readiness" — whether direct relations can move into MCP handoff. */
  agentReadinessTitle: string;
  agentReadinessLabels: Record<"ready" | "preflight" | "review", string>;
  /** Display labels for raw ontology kind tokens. Unknown/missing falls back to the raw token. */
  kindLabels: Record<string, string>;
  /** Display labels for raw relation type tokens. Unknown/missing falls back to the raw token. */
  relationTypeLabels: Record<string, string>;
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
  collapsed = false,
  onToggleCollapsed,
  className,
}: TopologyNodePopoverProps) {
  const total = focus.usedByCount + focus.dependsOnCount;
  const focusKindLabel = labels.kindLabels[focus.kind] ?? focus.kind;
  // 지도에 펼쳐진 자식은 리스트에서 제외 — 팝오버는 캔버스가 못 보여주는
  // 것(나머지 관계·평문 의미·카운트)에 전념한다.
  const visibleConnections = expandedChildIds
    ? focus.connections.filter((connection) => !expandedChildIds.has(connection.id))
    : focus.connections;
  const expandedCount = focus.connections.length - visibleConnections.length;
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
  const agentReadinessCounts = visibleConnections.reduce(
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
      count: agentReadinessCounts.ready,
    },
    {
      key: "preflight" as const,
      label: labels.agentReadinessLabels.preflight,
      count: agentReadinessCounts.preflight,
    },
    {
      key: "review" as const,
      label: labels.agentReadinessLabels.review,
      count: agentReadinessCounts.review,
    },
  ];

  if (collapsed) {
    return (
      <div
        role="dialog"
        aria-label={focus.title}
        data-testid="topology-node-popover"
        data-collapsed="true"
        data-size-policy="context-chip"
        className={`flex w-[min(480px,calc(100vw-2rem))] items-center gap-3 overflow-hidden rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.32)] ${className ?? ""}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {focusKindLabel}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {focus.title}
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-[color:var(--color-text-quaternary)]">
            {labels.usedBy} {focus.usedByCount} · {labels.dependsOn} {focus.dependsOnCount}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={labels.expand}
          data-node-popover-toggle="expand"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--color-border-soft)] px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          <ChevronUp size={13} aria-hidden />
          {labels.expand}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="-mr-1 shrink-0 rounded-md p-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={focus.title}
      data-testid="topology-node-popover"
      data-density="readable"
      data-size-policy="inspector-rail"
      className={`flex max-h-[min(68vh,34rem)] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_16px_36px_rgba(0,0,0,0.34)] min-[1400px]:w-[min(460px,calc(100vw-2rem))] 2xl:w-[480px] ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {focusKindLabel}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {focus.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      {focus.summary ? (
        <p className="mt-1.5 line-clamp-2 px-4 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
          {focus.summary}
        </p>
      ) : null}

      {significance ? (
        <div
          data-testid="topology-node-significance"
          className="mt-2.5 flex flex-col gap-1.5 px-4"
        >
          <p className="line-clamp-1 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
            {significance.whatLine}
          </p>
          <p
            className={
              significance.level === "core"
                ? "line-clamp-2 text-[12px] leading-4 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                : "line-clamp-2 text-[12px] leading-4 text-[color:var(--color-text-secondary)]"
            }
          >
            {significance.importanceLine}
          </p>
          <p className="line-clamp-1 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
            {significance.dependsOnLine}
          </p>
          <p className="line-clamp-1 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
            {significance.impactLine}
          </p>
        </div>
      ) : null}

      <div className="mt-2.5 grid grid-cols-2 gap-2 px-4">
        <Stat label={labels.usedBy} value={focus.usedByCount} />
        <Stat label={labels.dependsOn} value={focus.dependsOnCount} />
      </div>

      <div
        data-testid="topology-connections-section"
        className="mt-2.5 min-h-0 flex-1 border-t border-[color:var(--color-divider)] px-4 py-3"
      >
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {labels.connections} ({total})
        </p>
        <p
          data-testid="topology-relation-lens"
          className="mb-1.5 line-clamp-2 text-[10px] leading-4 text-[color:var(--color-text-quaternary)]"
        >
          <span className="font-mono uppercase tracking-[0.08em]">
            {labels.relationLensTitle}
          </span>
          {" · "}
          {relationFactLabel}
          {" · "}
          {relationTypeLabel}
          {" · "}
          {labels.relationLensNoScores}
        </p>
        <div
          data-testid="topology-relation-quality-lens"
          aria-label={labels.relationQualityTitle}
          className="mb-1.5 flex flex-wrap gap-1"
        >
          {relationQualityItems.map(({ quality, label, count }) => (
            <span
              key={quality}
              data-relation-quality-chip={quality}
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] leading-3.5 ${relationQualityChipClassName(quality, count)}`}
            >
              <span className="font-mono uppercase tracking-[0.06em]">{label}</span>
              <span className="font-mono tabular-nums">{count}</span>
            </span>
          ))}
        </div>
        <div
          data-testid="topology-node-agent-readiness-lens"
          aria-label={labels.agentReadinessTitle}
          className="mb-2 flex flex-wrap gap-1"
        >
          {agentReadinessItems.map(({ key, label, count }) => (
            <span
              key={key}
              data-agent-readiness-chip={key}
              data-count={count}
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] leading-3.5 ${agentReadinessChipClassName(key, count)}`}
            >
              <span className="font-mono uppercase tracking-[0.06em]">{label}</span>
              <span className="font-mono tabular-nums">{count}</span>
            </span>
          ))}
        </div>
        {expandedCount > 0 ? (
          <p className="mb-1 px-2 text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
            {labels.expandedNote.replace("{count}", String(expandedCount))}
          </p>
        ) : null}
        {visibleConnections.length > 0 ? (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
            {visibleConnections.map((connection, index) => {
              const directionLabel =
                connection.direction === "outgoing" ? labels.dependsOn : labels.usedBy;
              const relationTypeLabel =
                labels.relationTypeLabels[connection.relationType] ??
                connection.relationType;
              const kindLabel = labels.kindLabels[connection.kind] ?? connection.kind;
              const evidenceState = relationEvidenceState(connection);
              const agentGateKind = relationAgentGateKind(connection);
              const primaryCopyAction = relationPrimaryCopyAction(agentGateKind);
              return (
                <li key={`${connection.id}-${connection.direction}-${index}`}>
                  <button
                    type="button"
                    data-relation-row
                    data-relation-direction={connection.direction}
                    data-relation-type={connection.relationType}
                    data-relation-quality={connection.relationQuality}
                    data-relation-evidence-state={evidenceState}
                    data-relation-evidence-count={connection.evidenceCount}
                    data-agent-gate-kind={agentGateKind}
                    data-primary-copy-action={primaryCopyAction}
                    onClick={() => onSelectConnection(connection.id)}
                    className="group flex w-full items-stretch gap-2 rounded-md border border-transparent bg-[color:var(--color-overlay-1)]/40 px-2 py-1.5 text-left transition-[border-color,background-color] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-1)]"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] text-[color:var(--color-text-tertiary)] group-hover:text-[color:var(--color-text-secondary)]">
                      {connection.direction === "outgoing" ? (
                        <ArrowUpRight size={12} aria-hidden />
                      ) : (
                        <ArrowDownLeft size={12} aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          data-relation-type-label
                          className="shrink-0 rounded-full border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]"
                        >
                          {relationTypeLabel}
                        </span>
                        <span
                          data-relation-quality-dot
                          aria-label={labels.relationQualityLabels[connection.relationQuality]}
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${relationQualityDotClassName(connection.relationQuality)}`}
                        />
                        <span
                          aria-hidden="true"
                          data-relation-evidence-glyph={evidenceState}
                          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.10)] bg-[color:rgba(255,255,255,0.045)] px-1 font-mono text-[8px] leading-none text-[color:var(--color-text-tertiary)]"
                        >
                          {relationEvidenceGlyph(connection)}
                        </span>
                        <span
                          aria-hidden="true"
                          data-relation-row-agent-gate={agentGateKind}
                          data-primary-copy-action={primaryCopyAction}
                          className={`inline-flex h-4 min-w-[2rem] shrink-0 items-center justify-center rounded-full border px-1 font-mono text-[8px] uppercase leading-none ${relationAgentGateChipClassName(agentGateKind)}`}
                        >
                          {relationAgentGateChipText(agentGateKind)}
                        </span>
                        <span className="min-w-0 truncate text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                          {connection.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[color:var(--color-text-quaternary)]">
                        {directionLabel} · {kindLabel}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : expandedCount === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[color:var(--color-text-quaternary)]">
            {labels.noConnections}
          </p>
        ) : null}
        {focus.hiddenConnectionCount > 0 ? (
          <p className="mt-1 px-2 text-[11px] text-[color:var(--color-text-quaternary)]">
            +{focus.hiddenConnectionCount} {labels.moreSuffix}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-[color:var(--color-divider)] px-3 py-2.5">
        <div className="flex gap-2">
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={labels.collapse}
              data-node-popover-toggle="collapse"
              className="hidden shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] max-lg:inline-flex"
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenFullDetail}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] py-1.5 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
          >
            {labels.openFullDetail}
            {focus.hiddenConnectionCount > 0 ? (
              <span className="rounded-full border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                +{focus.hiddenConnectionCount} {labels.moreSuffix}
              </span>
            ) : null}
            <ArrowUpRight size={13} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}

const relationQualityOrder: TopologyRelationQuality[] = [
  "strong",
  "supported",
  "weak",
  "review",
];

function relationQualityChipClassName(
  quality: TopologyRelationQuality,
  count: number,
) {
  const muted = count === 0 ? "opacity-45" : "";
  const tone = {
    strong:
      "border-indigo-400/35 bg-indigo-400/10 text-[color:var(--color-text-secondary)]",
    supported:
      "border-cyan-400/30 bg-cyan-400/10 text-[color:var(--color-text-secondary)]",
    weak:
      "border-amber-400/30 bg-amber-400/10 text-[color:var(--color-text-tertiary)]",
    review:
      "border-rose-400/35 bg-rose-400/10 text-[color:var(--color-text-tertiary)]",
  } satisfies Record<TopologyRelationQuality, string>;
  return `${tone[quality]} ${muted}`;
}

function relationQualityDotClassName(quality: TopologyRelationQuality) {
  const tone = {
    strong: "bg-indigo-300 shadow-[0_0_10px_rgba(129,140,248,0.48)]",
    supported: "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.38)]",
    weak: "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.32)]",
    review: "bg-rose-300 shadow-[0_0_10px_rgba(253,164,175,0.38)]",
  } satisfies Record<TopologyRelationQuality, string>;
  return tone[quality];
}

function agentReadinessChipClassName(
  key: "ready" | "preflight" | "review",
  count: number,
): string {
  const muted = count === 0 ? "opacity-45" : "";
  const tone = {
    ready: "border-indigo-400/35 bg-indigo-400/10 text-[color:var(--color-text-secondary)]",
    preflight:
      "border-amber-400/30 bg-amber-400/10 text-[color:var(--color-text-tertiary)]",
    review: "border-rose-400/35 bg-rose-400/10 text-[color:var(--color-text-tertiary)]",
  } satisfies Record<"ready" | "preflight" | "review", string>;
  return `${tone[key]} ${muted}`;
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

function relationAgentGateChipText(gateKind: RelationAgentGateKind): string {
  if (gateKind === "handoff-ready") return "MCP";
  if (gateKind === "preflight-first") return "check";
  return "review";
}

function relationAgentGateChipClassName(gateKind: RelationAgentGateKind): string {
  if (gateKind === "handoff-ready") {
    return "border-indigo-400/35 bg-indigo-400/10 text-[color:rgba(222,225,255,0.94)]";
  }
  if (gateKind === "preflight-first") {
    return "border-amber-400/35 bg-amber-400/10 text-[color:rgba(247,212,150,0.92)]";
  }
  return "border-rose-400/35 bg-rose-400/10 text-[color:rgba(255,190,190,0.92)]";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2">
      <p className="text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}
