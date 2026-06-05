import { useTranslations } from "next-intl";
import { GitBranch, Plus, Minus, PencilLine, Flag, ListFilter, Check, Waypoints, Clipboard } from "lucide-react";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { formatAgentPostChangeSyncPacket, type OntologyChangeset } from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

/** kind 별 칩 노출 상한 — 초과분은 "+N 더" 로 명시(silent cap 방지). */
const MAX_CHANGE_CHIPS = 24;
const MAX_AGENT_CHANGE_ROWS = 12;

/**
 * 온톨로지 변경점(changeset) 패널 — 회의·설계 리뷰용 "지금까지 뭐가 바뀌었나".
 *
 * 세션 baseline 을 찍은 뒤(개발자/AI agent 가 vault 를 수정하면 atlas 가 재-derive),
 * baseline 대비 added/changed/removed 노드를 한눈에 보여주고 클릭하면 그 노드로
 * 점프. 새 패널 하나만 추가(off by default — baseline 안 찍으면 CTA 만) → 복잡도
 * 최소. 같은 changeset 을 AI agent 는 MCP 로 조회(별도 트랙).
 */

type ChangeKind = "added" | "changed" | "removed";

const KIND_META: Record<ChangeKind, { icon: typeof Plus; tone: string }> = {
  // added = green(success), changed = indigo, removed = red(danger) — 신호 톤은 mode-aware 토큰.
  added: {
    icon: Plus,
    tone: "border-[color:rgba(39,166,68,0.34)] bg-[color:rgba(39,166,68,0.10)] text-[color:var(--color-status-success)]",
  },
  changed: {
    icon: PencilLine,
    tone: "border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]",
  },
  removed: {
    icon: Minus,
    tone: "border-[color:rgba(229,72,77,0.30)] bg-[color:rgba(229,72,77,0.08)] text-[color:var(--color-status-danger)]",
  },
};

function formatAgentNodeRows({
  ids,
  label,
  nodeById,
  removedLabel,
  kindLabelOf,
  dependentsByNode,
}: {
  ids: string[];
  label: string;
  nodeById: Map<string, KnowledgeGraphNode>;
  removedLabel: (id: string) => string;
  kindLabelOf: (id: string) => string | null;
  dependentsByNode?: Map<string, number>;
}): string[] {
  if (ids.length === 0) return [`${label}: none`];
  const rows = ids.slice(0, MAX_AGENT_CHANGE_ROWS).map((id) => {
    const node = nodeById.get(id);
    const title = node?.title ?? removedLabel(id);
    const kind = kindLabelOf(id) ?? node?.kind ?? "unknown";
    const dependents = dependentsByNode?.get(id) ?? 0;
    const impact = dependents > 0 ? `, incoming dependents: ${dependents}` : "";
    return `- ${id} (${kind}) — ${title}${impact}`;
  });
  const hidden = ids.length - MAX_AGENT_CHANGE_ROWS;
  if (hidden > 0) rows.push(`- +${hidden} more ${label.toLowerCase()} omitted from this compact handoff`);
  return [`${label}:`, ...rows];
}

function formatAgentChangeHandoff({
  changeset,
  nodeById,
  removedLabel,
  presentKindLabelOf,
  removedKindLabelOf,
  dependentsByNode,
}: {
  changeset: OntologyChangeset;
  nodeById: Map<string, KnowledgeGraphNode>;
  removedLabel: (id: string) => string;
  presentKindLabelOf: (id: string) => string | null;
  removedKindLabelOf: (id: string) => string | null;
  dependentsByNode?: Map<string, number>;
}): string {
  const changedOrAdded = [...changeset.addedNodes, ...changeset.changedNodes].slice(
    0,
    MAX_AGENT_CHANGE_ROWS,
  );
  const nodeChecks = changedOrAdded.flatMap((id) => [
    `query_ontology({ operation: "node_profile", slug: "${id}", depth: 2, limit: 12 })`,
    `query_ontology({ operation: "blast_radius", slug: "${id}", depth: 2, direction: "incoming" })`,
  ]);
  return [
    "# Ontology Atlas ontology change handoff",
    "",
    `Total changes since baseline: ${changeset.total}`,
    `Nodes: +${changeset.addedNodes.length} / ~${changeset.changedNodes.length} / -${changeset.removedNodes.length}`,
    `Edges: +${changeset.addedEdges.length} / -${changeset.removedEdges.length}`,
    "",
    ...formatAgentNodeRows({
      ids: changeset.addedNodes,
      label: "Added nodes",
      nodeById,
      removedLabel,
      kindLabelOf: presentKindLabelOf,
      dependentsByNode,
    }),
    "",
    ...formatAgentNodeRows({
      ids: changeset.changedNodes,
      label: "Changed nodes",
      nodeById,
      removedLabel,
      kindLabelOf: presentKindLabelOf,
      dependentsByNode,
    }),
    "",
    ...formatAgentNodeRows({
      ids: changeset.removedNodes,
      label: "Removed nodes",
      nodeById,
      removedLabel,
      kindLabelOf: removedKindLabelOf,
    }),
    "",
    "Agent run order:",
    '1. Run `query_ontology({ operation: "health", limit: 5 })` before trusting the diff.',
    "2. Inspect changed/added nodes with the focused MCP calls below.",
    "3. Ask the human which changes are expected before writing follow-up frontmatter.",
    "4. If you write anything, finish with the post-change sync gate.",
    "",
    "Focused MCP checks:",
    ...(nodeChecks.length > 0 ? nodeChecks.map((check) => `- ${check}`) : ["- none"]),
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}

function ChangeChips({
  ids,
  kind,
  nodeById,
  onSelectNode,
  onAcknowledgeNode,
  removedLabel,
  moreLabel,
  reviewedLabel,
  dependentsByNode,
  impactLabel,
  kindLabelOf,
}: {
  ids: string[];
  kind: ChangeKind;
  nodeById: Map<string, KnowledgeGraphNode>;
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /** 한 변경을 "리뷰함" 으로 — 그 노드만 baseline advance → 칩이 사라진다(비파괴). */
  onAcknowledgeNode: (id: string) => void;
  removedLabel: (id: string) => string;
  moreLabel: (count: number) => string;
  /** ✓ 버튼 aria/title — title 인자로 노드명을 받는다. */
  reviewedLabel: (title: string) => string;
  /** 노드 id → 의존자 수(blast radius). 변경(added|changed)에만, >0 일 때 칩에 노출. */
  dependentsByNode?: Map<string, number>;
  /** blast-radius 배지 aria/title — 의존자 수를 받는다. */
  impactLabel: (count: number) => string;
  /** 노드 id → 로컬라이즈된 kind 라벨(없으면 null). 칩에 dimmed prefix 로 노출. */
  kindLabelOf: (id: string) => string | null;
}) {
  if (ids.length === 0) return null;
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const overflow = ids.length - MAX_CHANGE_CHIPS;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.slice(0, MAX_CHANGE_CHIPS).map((id) => {
        const node = nodeById.get(id);
        const title = node ? node.title : removedLabel(id);
        const kindLabel = kindLabelOf(id);
        // blast radius — 이 변경이 영향 주는 의존자 수(>0 일 때만). "WHAT 바뀌었나"
        // 너머 "얼마나 ripple 하나" 를 보여 리뷰를 consequential 하게(Self-Drawing Diff #2).
        const dependents = dependentsByNode?.get(id) ?? 0;
        const className = `inline-flex max-w-[260px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${meta.tone}`;
        const inner = (
          <>
            <Icon size={11} aria-hidden />
            {kindLabel ? (
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] opacity-60">
                {kindLabel}
              </span>
            ) : null}
            <span className="truncate">{title}</span>
            {dependents > 0 ? (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[9px] tabular-nums opacity-70"
                title={impactLabel(dependents)}
                aria-label={impactLabel(dependents)}
              >
                <Waypoints size={9} aria-hidden />
                {dependents}
              </span>
            ) : null}
          </>
        );
        // removed 노드는 더 이상 그래프에 없어 점프 불가 → 비활성 span.
        // 칩 옆 ✓ = "리뷰함"(per-node baseline advance) → 칩이 사라진다(비파괴).
        return (
          <li key={`${kind}:${id}`} className="inline-flex items-center gap-0.5">
            {node ? (
              <button
                type="button"
                onClick={() => onSelectNode(node)}
                className={`${className} hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset`}
              >
                {inner}
              </button>
            ) : (
              <span className={`${className} line-through opacity-70`}>{inner}</span>
            )}
            <button
              type="button"
              onClick={() => onAcknowledgeNode(id)}
              aria-label={reviewedLabel(title)}
              title={reviewedLabel(title)}
              data-testid={`ack-${kind}-${id}`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:rgba(39,166,68,0.14)] hover:text-[color:var(--color-status-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
            >
              <Check size={11} aria-hidden />
            </button>
          </li>
        );
      })}
      {overflow > 0 ? (
        <li
          data-testid={`change-more-${kind}`}
          className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums text-[color:var(--color-text-quaternary)]"
        >
          {moreLabel(overflow)}
        </li>
      ) : null}
    </ul>
  );
}

export function OntologyChangePanel({
  changeset,
  hasBaseline,
  nodeById,
  onMarkBaseline,
  onClearBaseline,
  onSelectNode,
  onAcknowledgeNode,
  dependentsByNode,
  changesOnly,
  onToggleChangesOnly,
}: {
  changeset: OntologyChangeset;
  hasBaseline: boolean;
  nodeById: Map<string, KnowledgeGraphNode>;
  onMarkBaseline: () => void;
  onClearBaseline: () => void;
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /** 한 변경을 "리뷰함" 으로 표시 — Self-Drawing Diff push-move #1. */
  onAcknowledgeNode: (id: string) => void;
  /** 노드 id → 의존자 수(blast radius). 변경 칩에 영향 배지로 — Self-Drawing Diff #2. */
  dependentsByNode?: Map<string, number>;
  /** /ontology 트리를 변경 노드만으로 스코프할지 — B2. */
  changesOnly: boolean;
  onToggleChangesOnly: () => void;
}) {
  const t = useTranslations("ontologyView.changes");
  const kindLabel = useOntologyKindLabel();
  const agentCopy = useCopyFeedback();
  // added/changed 노드는 현재 그래프에 있으니 nodeById 로 kind 를 얻고, removed
  // 노드는 그래프에서 사라졌으니 changeset.removedNodeKinds 로 얻는다 — 어느 쪽도
  // 없으면 null(라벨 생략). 모든 surface(범례·tooltip·drawer)와 일관되게 kind 노출.
  const presentKindLabelOf = (id: string): string | null => {
    const node = nodeById.get(id);
    return node ? kindLabel(node.kind) : null;
  };
  const removedKindLabelOf = (id: string): string | null => {
    const k = changeset.removedNodeKinds.get(id);
    return k ? kindLabel(k) : null;
  };
  // 트리에 보이는 변경(added|changed)이 있을 때만 "변경점만" 토글이 의미 있음.
  // removed 노드는 그래프에 없어 트리 필터 대상이 아님.
  const canScopeTree = changeset.touchedNodeIds.size > 0;

  const markButton = (
    <button
      type="button"
      onClick={onMarkBaseline}
      data-testid="mark-baseline"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
    >
      <Flag size={12} aria-hidden />
      {hasBaseline ? t("remark") : t("mark")}
    </button>
  );

  if (!hasBaseline) {
    return (
      <section
        aria-label={t("ariaLabel")}
        data-testid="ontology-change-panel"
        data-density="compact"
        className="px-1 py-0.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[color:var(--color-text-tertiary)]">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
            <p className="text-[11px] font-medium text-[color:var(--color-text-secondary)]">
              {t("eyebrow")}
            </p>
            <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
              {t("emptyCompactHint")}
            </p>
          </div>
          {markButton}
        </div>
      </section>
    );
  }

  const removedLabel = (id: string) => id.split(":").pop() ?? id;
  const moreLabel = (count: number) => t("more", { count });
  const reviewedLabel = (title: string) => t("markReviewed", { title });
  const impactLabel = (count: number) => t("impact", { count });
  const agentHandoff = formatAgentChangeHandoff({
    changeset,
    nodeById,
    removedLabel,
    presentKindLabelOf,
    removedKindLabelOf,
    dependentsByNode,
  });
  const agentCopyLabel =
    agentCopy.state === "copied"
      ? t("copyAgentCopied")
      : agentCopy.state === "failed"
        ? t("copyAgentFailed")
        : t("copyAgent");

  if (changeset.total === 0) {
    return (
      <section
        aria-label={t("ariaLabel")}
        data-testid="ontology-change-panel"
        data-density="compact"
        className="px-1 py-0.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[color:var(--color-text-tertiary)]">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
            <p className="text-[11px] font-medium text-[color:var(--color-text-secondary)]">
              {t("eyebrow")}
            </p>
            <span
              className="text-[11px] text-[color:var(--color-text-quaternary)]"
              data-testid="change-summary"
              aria-live="polite"
            >
              {t("none")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {markButton}
            <button
              type="button"
              onClick={onClearBaseline}
              className="inline-flex h-8 shrink-0 items-center rounded-full px-2 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
            >
              {t("clear")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="ontology-change-panel"
      data-density="review"
      className="rounded-2xl border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.05)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
          <span
            className="font-mono text-[11px] tabular-nums text-[color:var(--color-text-secondary)]"
            data-testid="change-summary"
            aria-live="polite"
          >
            {t("summary", {
              added: changeset.addedNodes.length,
              changed: changeset.changedNodes.length,
              removed: changeset.removedNodes.length,
            })}
          </span>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1.5" data-testid="change-panel-actions">
          <button
            type="button"
            onClick={() => void agentCopy.copy(agentHandoff)}
            aria-label={t("copyAgentAria")}
            data-testid="copy-change-agent-handoff"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            {agentCopy.state === "copied" ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
            {agentCopyLabel}
          </button>
          {canScopeTree ? (
            <button
              type="button"
              onClick={onToggleChangesOnly}
              aria-pressed={changesOnly}
              data-testid="changes-only-toggle"
              className={
                changesOnly
                  ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
                  : "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
              }
            >
              <ListFilter size={12} aria-hidden />
              {t("changesOnly")}
            </button>
          ) : null}
          {markButton}
          <button
            type="button"
            onClick={onClearBaseline}
            className="inline-flex h-8 shrink-0 items-center rounded-full px-2 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
          >
            {t("clear")}
          </button>
        </div>
      </div>
      <div
        className="mt-2.5 flex max-h-32 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 md:max-h-none md:overflow-visible md:pr-0"
        data-testid="change-panel-chip-scroll"
      >
        <ChangeChips ids={changeset.addedNodes} kind="added" nodeById={nodeById} onSelectNode={onSelectNode} onAcknowledgeNode={onAcknowledgeNode} removedLabel={removedLabel} moreLabel={moreLabel} reviewedLabel={reviewedLabel} dependentsByNode={dependentsByNode} impactLabel={impactLabel} kindLabelOf={presentKindLabelOf} />
        <ChangeChips ids={changeset.changedNodes} kind="changed" nodeById={nodeById} onSelectNode={onSelectNode} onAcknowledgeNode={onAcknowledgeNode} removedLabel={removedLabel} moreLabel={moreLabel} reviewedLabel={reviewedLabel} dependentsByNode={dependentsByNode} impactLabel={impactLabel} kindLabelOf={presentKindLabelOf} />
        <ChangeChips ids={changeset.removedNodes} kind="removed" nodeById={nodeById} onSelectNode={onSelectNode} onAcknowledgeNode={onAcknowledgeNode} removedLabel={removedLabel} moreLabel={moreLabel} reviewedLabel={reviewedLabel} impactLabel={impactLabel} kindLabelOf={removedKindLabelOf} />
      </div>
    </section>
  );
}
