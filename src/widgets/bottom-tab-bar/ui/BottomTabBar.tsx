'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Network, FolderKanban, FileText, Route } from 'lucide-react';
import { useLocalVault } from '@/features/docs-vault-local';
import { isBottomTabActive, shouldHideBottomTabBar } from '../lib/is-tab-active';

interface TabItem {
  href: string;
  /** Translation key under `nav.*` for the visible tab label. */
  labelKey: 'ontology' | 'topology' | 'projects' | 'docs';
  icon: typeof Network;
  /** pathname 이 이 prefix 들 중 하나로 시작하면 활성 탭. 빈 배열이면 정확히 href 와 일치할 때만. */
  matchPrefixes: ReadonlyArray<string>;
}

// 모바일 한정 하단 탭바. 반복 작업자가 바로 오가는 4 개 destination 노출:
// ontology · topology · projects · docs. Topology 는 숨겨진 sub-link 로 두면
// 실제 폴더 선택 후 그래프 이동을 놓치기 쉬워 별도 탭으로 승격.
const TABS: ReadonlyArray<TabItem> = [
  { href: '/ontology/', labelKey: 'ontology', icon: Network, matchPrefixes: ['/ontology'] },
  { href: '/topology/', labelKey: 'topology', icon: Route, matchPrefixes: ['/topology'] },
  { href: '/projects/', labelKey: 'projects', icon: FolderKanban, matchPrefixes: ['/projects', '/project'] },
  // "문서" tab — vault picker / 편집기. mission v2 후 모든 모드에서 docs
  // vault 가 진입점.
  { href: '/docs/', labelKey: 'docs', icon: FileText, matchPrefixes: ['/docs'] },
];

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');
  const vault = useLocalVault();

  if (shouldHideBottomTabBar(pathname, vault.status === 'loaded')) {
    return null;
  }

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
  return isBottomTabActive(pathname, tab.href, tab.matchPrefixes);
}
