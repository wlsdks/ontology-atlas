import { useTranslations } from "next-intl";
import { GitBranch, Plus, Minus, PencilLine, Flag, ListFilter } from "lucide-react";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

/** kind 별 칩 노출 상한 — 초과분은 "+N 더" 로 명시(silent cap 방지). */
const MAX_CHANGE_CHIPS = 24;

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

function ChangeChips({
  ids,
  kind,
  nodeById,
  onSelectNode,
  removedLabel,
  moreLabel,
}: {
  ids: string[];
  kind: ChangeKind;
  nodeById: Map<string, KnowledgeGraphNode>;
  onSelectNode: (node: KnowledgeGraphNode) => void;
  removedLabel: (id: string) => string;
  moreLabel: (count: number) => string;
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
        const className = `inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${meta.tone}`;
        const inner = (
          <>
            <Icon size={11} aria-hidden />
            <span className="truncate">{title}</span>
          </>
        );
        // removed 노드는 더 이상 그래프에 없어 점프 불가 → 비활성 span.
        return (
          <li key={`${kind}:${id}`}>
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
  changesOnly,
  onToggleChangesOnly,
}: {
  changeset: OntologyChangeset;
  hasBaseline: boolean;
  nodeById: Map<string, KnowledgeGraphNode>;
  onMarkBaseline: () => void;
  onClearBaseline: () => void;
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /** /ontology 트리를 변경 노드만으로 스코프할지 — B2. */
  changesOnly: boolean;
  onToggleChangesOnly: () => void;
}) {
  const t = useTranslations("ontologyView.changes");
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
        className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-[color:var(--color-text-quaternary)]" aria-hidden />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
          </div>
          {markButton}
        </div>
        <p className="mt-1.5 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {t("emptyHint")}
        </p>
      </section>
    );
  }

  const removedLabel = (id: string) => id.split(":").pop() ?? id;
  const moreLabel = (count: number) => t("more", { count });

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="ontology-change-panel"
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
            {changeset.total === 0
              ? t("none")
              : t("summary", {
                  added: changeset.addedNodes.length,
                  changed: changeset.changedNodes.length,
                  removed: changeset.removedNodes.length,
                })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
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
      {changeset.total > 0 ? (
        <div className="mt-2.5 flex flex-col gap-2">
          <ChangeChips ids={changeset.addedNodes} kind="added" nodeById={nodeById} onSelectNode={onSelectNode} removedLabel={removedLabel} moreLabel={moreLabel} />
          <ChangeChips ids={changeset.changedNodes} kind="changed" nodeById={nodeById} onSelectNode={onSelectNode} removedLabel={removedLabel} moreLabel={moreLabel} />
          <ChangeChips ids={changeset.removedNodes} kind="removed" nodeById={nodeById} onSelectNode={onSelectNode} removedLabel={removedLabel} moreLabel={moreLabel} />
        </div>
      ) : null}
    </section>
  );
}
