"use client";

import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useOntologyInsight } from "@/features/vault-ontology";
import { buildMeaningfulOntologyStats } from "@/shared/lib/ontology-tree";


/**
 * 워크스페이스 전반 ontology 한 줄 stat strip.
 *
 * 프로젝트 목록·대시보드 헤더 등에서 ontology 의 가벼운 가시.
 * `useOntologyInsight` 의 진실원 우선순위 (vault > 빌드타임 dogfood) 그대로
 * 따라간다 — vault 안 골랐어도 dogfood 노드가 즉시 surface. 매치 0 일 때만
 * 자동 숨김.
 *
 * 표시: 총 노드 / 도메인 / 역량 / 요소 카운트 + stub 강조 (있을 때만 amber) +
 * "트리 →" 링크. 최소 노이즈.
 */
export function WorkspaceOntologyStrip() {
  const t = useTranslations("searchWidgets.workspaceStrip");
  const { insight } = useOntologyInsight();

  const stats = useMemo(
    () => buildMeaningfulOntologyStats(insight?.nodes ?? []),
    [insight],
  );
  const counts = {
    total: stats.total,
    domain: stats.byKind.domain,
    capability: stats.byKind.capability,
    element: stats.byKind.element,
    stub: stats.byKind.unknown,
  };

  if (counts.total === 0) return null;

  const ontologyHref = "/ontology/";
  // 미해결 stub 은 /ontology 트리 하단의 frontmatter 안내 + 빌더 (/ontology/edit) 에서 채움.
  const stubHref = ontologyHref;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-text-tertiary)]">
      <Link
        href={ontologyHref}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(159,170,235,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.16)]"
        aria-label={t("openOntologyAriaLabel")}
      >
        Ontology {counts.total}
        <span aria-hidden>→</span>
      </Link>
      {counts.domain > 0 ? <CountChip label={t("domain")} value={counts.domain} /> : null}
      {counts.capability > 0 ? <CountChip label={t("capability")} value={counts.capability} /> : null}
      {counts.element > 0 ? <CountChip label={t("element")} value={counts.element} /> : null}
      {counts.stub > 0 ? (
        <Link
          href={stubHref}
          className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(255,179,71,0.32)] bg-[color:rgba(255,179,71,0.08)] px-2.5 py-1 text-[10px] tracking-[0.02em] text-[color:rgba(238,198,128,0.95)] transition-colors hover:bg-[color:rgba(255,179,71,0.16)]"
          aria-label={t("stubAriaLabel")}
          title={t("stubTitle")}
        >
          {t("stubLabel")} {counts.stub}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
      {label} {value}
    </span>
  );
}
