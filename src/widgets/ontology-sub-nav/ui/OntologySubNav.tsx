'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, GitBranch, Network, Share2 } from 'lucide-react';
import { useOntologyInsight } from '@/features/vault-ontology';

/**
 * `/ontology/*` 4 surface 공통 sub-nav.
 *
 * 사용자 피드백: 트리 / 빌더 / 인사이트 / 관계 가 같은 vault 데이터를 보지만
 * 사이의 점프 affordance 가 없어 "단절된 시스템" 으로 느껴짐. 본 위젯이
 * - 4 surface 에 동일 pill row 노출
 * - 좌측에 "ONTOLOGY · {N} 노드 · {E} 관계" caption — 모든 view 가 같은
 *   데이터를 보고 있다는 시각 cue
 * 로 일관성을 회복한다.
 *
 * OperationsNav 바로 아래에 mount — 각 ontology page 가 본문 시작 전에 한 번씩.
 */
interface SubItem {
  href: string;
  labelKey: 'tree' | 'builder' | 'insights' | 'relations';
  icon: typeof Network;
  /** pathname 정규화 (끝 / 제거) 후 정확히 일치하는 경로들. tree 는
   *  '' (루트) + '/ontology' 모두 — vault 선택 시 RootEntryPage 가 같은
   *  OntologyViewPage 를 / 와 /ontology 두 곳에서 렌더하므로. */
  exactMatches: ReadonlyArray<string>;
  /** 정규화 pathname 이 이 prefix 들 중 하나로 시작하면 active. */
  prefixMatches: ReadonlyArray<string>;
}

const SUB_ITEMS: ReadonlyArray<SubItem> = [
  { href: '/ontology/', labelKey: 'tree', icon: Network, exactMatches: ['', '/ontology'], prefixMatches: [] },
  { href: '/ontology/edit/', labelKey: 'builder', icon: GitBranch, exactMatches: [], prefixMatches: ['/ontology/edit'] },
  { href: '/ontology/insights/', labelKey: 'insights', icon: BarChart3, exactMatches: [], prefixMatches: ['/ontology/insights'] },
  { href: '/ontology/relations/', labelKey: 'relations', icon: Share2, exactMatches: [], prefixMatches: ['/ontology/relations'] },
];

function isItemActive(pathname: string, item: SubItem): boolean {
  const normalized = pathname.replace(/\/$/, '');
  if (item.exactMatches.includes(normalized)) return true;
  return item.prefixMatches.some((p) => normalized.startsWith(p));
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
    <nav
      aria-label={t('ariaLabel')}
      className="border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
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
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:rgba(94,106,210,0.4)] bg-[color:rgba(94,106,210,0.14)] px-2.5 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]'
                      : 'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                  }
                >
                  <Icon size={12} aria-hidden />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
