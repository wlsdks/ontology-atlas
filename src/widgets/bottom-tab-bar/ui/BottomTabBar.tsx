'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Network, FolderKanban, FileText } from 'lucide-react';

interface TabItem {
  href: string;
  /** Translation key under `nav.*` for the visible tab label. */
  labelKey: 'ontology' | 'projects' | 'docs';
  icon: typeof Network;
  /** pathname 이 이 prefix 들 중 하나로 시작하면 활성 탭. 빈 배열이면 정확히 href 와 일치할 때만. */
  matchPrefixes: ReadonlyArray<string>;
}

// 모바일 한정 하단 탭바. 메인 3 개 destination 만 노출 — 미니멀 모바일 결.
// "온톨로지 · 프로젝트 · 문서". / 가 ontology hub — 첫 탭 라벨/아이콘이 그
// 정체성을 노출. 토폴로지는 온톨로지의 출구 view 라 별도 탭이 아닌
// OntologyView / OperationsNav 안의 sub-link 로 진입.
const TABS: ReadonlyArray<TabItem> = [
  { href: '/', labelKey: 'ontology', icon: Network, matchPrefixes: ['/ontology', '/topology'] },
  { href: '/projects/', labelKey: 'projects', icon: FolderKanban, matchPrefixes: ['/projects', '/project'] },
  // "문서" tab — vault picker / 편집기. mission v2 후 모든 모드에서 docs
  // vault 가 진입점.
  { href: '/docs/', labelKey: 'docs', icon: FileText, matchPrefixes: ['/docs'] },
];

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');

  return (
    <nav
      data-tabbar="primary"
      aria-label={t('primaryAriaLabel')}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-nav-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isTabActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset'
                : 'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset'
            }
          >
            <Icon size={20} aria-hidden />
            <span className="text-[10px] font-[var(--font-weight-signature)] leading-none">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function isTabActive(pathname: string, tab: TabItem): boolean {
  // matchPrefixes 가 우선 — `/` 홈 탭도 ['/ontology', '/topology'] prefix
  // 위에서 활성화돼야 한다 (홈 탭 라벨이 "Ontology" 라 하위 surface 진입 시
  // 아무 탭도 점등 안 되던 회귀 회피). prefix 가 안 잡히면 정확 일치 fallback —
  // 그래야 / 일 때 home 탭만, /projects 일 때 projects 탭만 활성.
  if (tab.matchPrefixes.some((p) => pathname.startsWith(p))) return true;
  return pathname === tab.href || pathname === tab.href.replace(/\/$/, '');
}
