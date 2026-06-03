'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, GitBranch, Network } from 'lucide-react';
import { useOntologyInsight } from '@/features/vault-ontology';
import { Tooltip } from '@/shared/ui';
import {
  isOntologySubItemActive,
  shouldShowOntologySubNav,
} from '../lib/active-matchers';

export { shouldShowOntologySubNav };

/**
 * `/ontology/*` 3 surface 공통 sub-nav (R2 cut A 후 4 → 3 — relations
 * 라우트 제거).
 *
 * 사용자 피드백: 둘러보기 (Browse) / 빌더 / 인사이트가 같은 vault
 * 데이터를 보지만 사이의 점프 affordance 가 없어 "단절된 시스템" 으로
 * 느껴짐. 본 위젯이
 * - 3 surface 에 동일 pill row 노출
 * - 좌측에 "ONTOLOGY · concepts · relations" caption —
 *   visible copy 는 사용자 언어로 두고 title hint 에서 projection / frontmatter
 *   count 차이를 설명하면서 모든 view 가 같은 vault-derived projection 을 본다는 cue
 * 로 일관성을 회복한다.
 *
 * OperationsNav 안에 inline 렌더 — 둘이 한 nav block 으로 시각적 융합돼
 * vertical chrome 감소. nav landmark 는 부모 (OperationsNav) 가 제공하므로
 * 본 컴포넌트의 outer 는 div.
 *
 * pathname 매칭으로 노출 자체를 결정 — / (RootEntry → OntologyView 인 경우)
 * 와 /ontology* 에서만 보임. shouldShowOntologySubNav 헬퍼 export.
 */
interface SubItem {
  href: string;
  // R2 cut A 에서 'relations' 라우트가 제거됐으므로 labelKey 도 3 가지로
  // 좁힌다. 미래 collab 단계에서 다시 도입되면 union 확장.
  labelKey: 'tree' | 'builder' | 'insights';
  /** 모드의 목적을 설명하는 tooltip — "직관적 선택" (Browse/Write/Query 분리). */
  tooltipKey: 'treeTooltip' | 'builderTooltip' | 'insightsTooltip';
  icon: typeof Network;
  /** pathname 정규화 (끝 / 제거) 후 정확히 일치하는 경로들. tree 는
   *  '' (루트) + '/ontology' 모두 — vault 선택 시 RootEntryPage 가 같은
   *  OntologyViewPage 를 / 와 /ontology 두 곳에서 렌더하므로. */
  exactMatches: ReadonlyArray<string>;
  /** 정규화 pathname 이 이 prefix 들 중 하나로 시작하면 active. */
  prefixMatches: ReadonlyArray<string>;
}

const SUB_ITEMS: ReadonlyArray<SubItem> = [
  { href: '/ontology/', labelKey: 'tree', tooltipKey: 'treeTooltip', icon: Network, exactMatches: ['', '/ontology'], prefixMatches: [] },
  { href: '/ontology/edit/', labelKey: 'builder', tooltipKey: 'builderTooltip', icon: GitBranch, exactMatches: [], prefixMatches: ['/ontology/edit'] },
  { href: '/ontology/insights/', labelKey: 'insights', tooltipKey: 'insightsTooltip', icon: BarChart3, exactMatches: [], prefixMatches: ['/ontology/insights'] },
];

function isItemActive(pathname: string, item: SubItem): boolean {
  return isOntologySubItemActive(pathname, item.exactMatches, item.prefixMatches);
}

export function OntologySubNav() {
  const pathname = usePathname() ?? '';
  const t = useTranslations('ontologySubNav');
  // 카운트는 *모든 ontology view 가 같은 진실원* 임을 시각화. error / loading
  // 시에도 위젯 자체는 mount — count 만 dim 하게 dash 로.
  const { insight } = useOntologyInsight();
  const nodeCount = insight?.nodes.length ?? null;
  const edgeCount = insight?.edges.length ?? null;

  return (
    <div
      id="ontology-sub-nav"
      role="group"
      aria-label={t('ariaLabel')}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--color-divider)] px-4 py-1.5 md:px-6"
    >
      <p
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]"
        title={t('countHint')}
      >
        {t('caption')}
        {nodeCount !== null ? (
          <>
            <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
            <span className="text-[color:var(--color-text-tertiary)]">
              {t('nodeCount', { count: nodeCount })}
            </span>
            <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
            <span className="text-[color:var(--color-text-tertiary)]">
              {t('edgeCount', { count: edgeCount ?? 0 })}
            </span>
          </>
        ) : null}
      </p>
      <ul className="flex items-center gap-1 overflow-x-auto">
        {SUB_ITEMS.map((item) => {
          const active = isItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Tooltip content={t(item.tooltipKey)}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:rgba(94,106,210,0.4)] bg-[color:rgba(94,106,210,0.14)] px-2.5 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]'
                      : 'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                  }
                >
                  <Icon size={12} aria-hidden />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
