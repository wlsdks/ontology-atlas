import { useTranslations } from "next-intl";
import { GitBranch, Minus, PencilLine, Plus } from "lucide-react";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";

/**
 * /ontology/insights 의 "기준 이후 변경점" 요약 스트립 — B2 (insights half).
 *
 * /ontology 의 OntologyChangePanel 과 같은 공용 core(useChangeBaseline +
 * computeOntologyChangeset)를 읽되, 분석 surface 에 맞게 *census 를 왜곡하지
 * 않는* 가벼운 요약 + deep-link 만 노출한다 (트리 스코프 토글은 트리가 있는
 * /ontology 전용). 칩 클릭 시 해당 노드의 insights 상세(`?node=`)로 점프해
 * 변경된 노드의 그래프 지표(degree·hub·readiness)를 바로 본다.
 *
 * 부모가 baseline 존재 시에만 마운트 → 기본 화면을 어지럽히지 않는다.
 */

const TONE: Record<"added" | "changed", { icon: typeof Plus; cls: string }> = {
  added: {
    icon: Plus,
    cls: "border-[color:rgba(39,166,68,0.34)] bg-[color:rgba(39,166,68,0.10)] text-[color:var(--color-status-success)]",
  },
  changed: {
    icon: PencilLine,
    cls: "border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]",
  },
};

export function InsightsChangeStrip({
  changeset,
  nodeById,
  onSelectNode,
}: {
  changeset: OntologyChangeset;
  nodeById: Map<string, KnowledgeGraphNode>;
  onSelectNode: (node: KnowledgeGraphNode) => void;
}) {
  const t = useTranslations("ontologyView.changes");
  const removedLabel = (id: string) => id.split(":").pop() ?? id;

  const linkable: Array<{ id: string; kind: "added" | "changed" }> = [
    ...changeset.addedNodes.map((id) => ({ id, kind: "added" as const })),
    ...changeset.changedNodes.map((id) => ({ id, kind: "changed" as const })),
  ];

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="insights-change-strip"
      className="mb-6 rounded-2xl border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.05)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={14} className="text-[color:var(--color-indigo-accent)]" aria-hidden />
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow")}
        </p>
        <span
          className="font-mono text-[11px] tabular-nums text-[color:var(--color-text-secondary)]"
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
      {linkable.length > 0 || changeset.removedNodes.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {linkable.slice(0, 24).map(({ id, kind }) => {
            const node = nodeById.get(id);
            if (!node) return null;
            const meta = TONE[kind];
            const Icon = meta.icon;
            return (
              <li key={`${kind}:${id}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode(node)}
                  className={`inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset ${meta.cls}`}
                >
                  <Icon size={11} aria-hidden />
                  <span className="truncate">{node.title}</span>
                </button>
              </li>
            );
          })}
          {changeset.removedNodes.slice(0, 12).map((id) => (
            <li key={`removed:${id}`}>
              <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-[color:rgba(229,72,77,0.30)] bg-[color:rgba(229,72,77,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--color-status-danger)] line-through opacity-70">
                <Minus size={11} aria-hidden />
                <span className="truncate">{removedLabel(id)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
