"use client";

import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { getOntologyKindTone, useOntologyKindLabel } from "@/entities/ontology-class";
import { useOntologyInsight } from "@/features/vault-ontology";
import { buildMeaningfulOntologyStats } from "@/shared/lib/ontology-tree";

export interface ProjectOntologyOverviewProps {
  projectSlug: string;
  /** 옵션 — sample 노드 표시 limit. 기본 6. */
  limit?: number;
}

function KindTonePill({
  kind,
  label,
  count,
  compact = false,
}: {
  kind: string;
  label: string;
  count?: number;
  compact?: boolean;
}) {
  const tone = getOntologyKindTone(kind);

  return (
    <span
      data-kind-tone={kind}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-mono uppercase ${
        compact
          ? "px-1.5 py-[1px] text-[9px] tracking-[0.10em]"
          : "px-2 py-0.5 text-[10px] tracking-[0.08em]"
      }`}
      style={{
        backgroundColor: tone.chipBg,
        borderColor: tone.chipBorder,
        color: tone.chipText,
      }}
    >
      <span
        aria-hidden
        className={compact ? "h-1.5 w-1.5 rounded-full border" : "h-2 w-2 rounded-full border"}
        style={{ backgroundColor: tone.fill, borderColor: tone.border }}
      />
      {label}
      {typeof count === "number" ? ` ${count}` : null}
    </span>
  );
}

/**
 * 프로젝트 상세 페이지 inline 카드 — "이 프로젝트에 자란 ontology 노드 N".
 *
 * `useOntologyInsight` (vault > 빌드타임 dogfood 진실원 우선순위) 의
 * nodes 를 `projectIds.includes(projectSlug)` 로 필터. project / document
 * kind 는 메타라 sample 에서 제외 (capability / element / domain 위주). 매치
 * 0 은 자체 숨김 — vault / dogfood 어느 모드든 매치만 있으면 surface.
 *
 * 클릭 시 `/ontology/` 트리로 점프 — 해당 프로젝트 root 진입.
 */
export function ProjectOntologyOverview({
  projectSlug,
  limit = 6,
}: ProjectOntologyOverviewProps) {
  const { insight } = useOntologyInsight();
  const kindLabel = useOntologyKindLabel();

  const matched = useMemo(
    () =>
      insight?.nodes.filter((n) => n.projectIds.includes(projectSlug)) ?? [],
    [insight, projectSlug],
  );

  const stats = useMemo(() => buildMeaningfulOntologyStats(matched), [matched]);

  // sample — project / document 제외, 그 외에서 limit 까지.
  const sampleNodes = useMemo(
    () => matched.filter((n) => n.kind !== "project" && n.kind !== "document").slice(0, limit),
    [matched, limit],
  );

  if (stats.total === 0) return null;

  const ontologyHref = "/ontology/";

  // kind 카운트 — buildMeaningfulOntologyStats 가 정의한 사용자 관심 단위.
  const orderedKinds = (["domain", "capability", "element", "unknown"] as const)
    .map((kind) => ({ kind, count: stats.byKind[kind] }))
    .filter((row) => row.count > 0);

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          이 프로젝트의 ontology 노드 {stats.total}
        </p>
        <Link
          href={ontologyHref}
          className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] hover:text-[color:var(--color-text-primary)]"
        >
          전체 트리 →
        </Link>
      </div>

      {orderedKinds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {orderedKinds.map(({ kind, count }) => (
            <KindTonePill key={kind} kind={kind} label={kindLabel(kind)} count={count} />
          ))}
        </div>
      ) : null}

      {sampleNodes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {sampleNodes.map((node) => (
            <li
              key={node.id}
              className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[12px]"
            >
              <KindTonePill kind={node.kind} label={kindLabel(node.kind)} compact />
              <span
                className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]"
                title={node.title}
              >
                {node.title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
        vault frontmatter (또는 빌더) 가 키워낸 개념·역량·요소. 이 프로젝트의 두 번째 척추.
      </p>
    </section>
  );
}
