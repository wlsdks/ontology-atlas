"use client";

import { ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import type { NodeSignificanceLevel } from "../lib/topology-node-significance";

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
  /** "닫기" — close aria-label. */
  close: string;
  /** "더" — suffix for the hidden remainder ("+5 더"). */
  moreSuffix: string;
  /** "{count}개는 왼쪽 지도에 펼쳐져 있어요" — 도킹 열과의 중복 안내. */
  expandedNote: string;
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
  className,
}: TopologyNodePopoverProps) {
  const total = focus.usedByCount + focus.dependsOnCount;
  // 지도에 펼쳐진 자식은 리스트에서 제외 — 팝오버는 캔버스가 못 보여주는
  // 것(나머지 관계·평문 의미·카운트)에 전념한다.
  const visibleConnections = expandedChildIds
    ? focus.connections.filter((connection) => !expandedChildIds.has(connection.id))
    : focus.connections;
  const expandedCount = focus.connections.length - visibleConnections.length;

  return (
    <div
      role="dialog"
      aria-label={focus.title}
      data-testid="topology-node-popover"
      className={`w-[320px] max-w-[88vw] overflow-hidden rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_12px_32px_rgba(0,0,0,0.32)] ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {focus.kind}
          </p>
          <h2 className="mt-1 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
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
        <p className="mt-2 line-clamp-2 px-4 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {focus.summary}
        </p>
      ) : null}

      {significance ? (
        <div
          data-testid="topology-node-significance"
          className="mt-3 flex flex-col gap-1.5 px-4"
        >
          <p className="text-[12px] leading-5 text-[color:var(--color-text-quaternary)]">
            {significance.whatLine}
          </p>
          <p
            className={
              significance.level === "core"
                ? "text-[13px] leading-5 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                : "text-[13px] leading-5 text-[color:var(--color-text-secondary)]"
            }
          >
            {significance.importanceLine}
          </p>
          <p className="text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {significance.dependsOnLine}
          </p>
          <p className="text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {significance.impactLine}
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 px-4">
        <Stat label={labels.usedBy} value={focus.usedByCount} />
        <Stat label={labels.dependsOn} value={focus.dependsOnCount} />
      </div>

      <div className="mt-3 border-t border-[color:var(--color-divider)] px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {labels.connections} ({total})
        </p>
        {expandedCount > 0 ? (
          <p className="mb-1.5 px-2 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
            {labels.expandedNote.replace("{count}", String(expandedCount))}
          </p>
        ) : null}
        {visibleConnections.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {visibleConnections.map((connection, index) => (
              <li key={`${connection.id}-${connection.direction}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectConnection(connection.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
                >
                  {connection.direction === "outgoing" ? (
                    <ArrowUpRight
                      size={13}
                      aria-hidden
                      className="shrink-0 text-[color:var(--color-text-quaternary)]"
                    />
                  ) : (
                    <ArrowDownLeft
                      size={13}
                      aria-hidden
                      className="shrink-0 text-[color:var(--color-text-quaternary)]"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-[color:var(--color-text-secondary)]">
                      {connection.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[color:var(--color-text-quaternary)]">
                      {connection.direction === "outgoing" ? labels.dependsOn : labels.usedBy}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                    {connection.relationType}
                  </span>
                </button>
              </li>
            ))}
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

      <footer className="border-t border-[color:var(--color-divider)] px-4 py-3">
        <button
          type="button"
          onClick={onOpenFullDetail}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] py-2 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          {labels.openFullDetail}
          <ArrowUpRight size={13} aria-hidden />
        </button>
      </footer>
    </div>
  );
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
