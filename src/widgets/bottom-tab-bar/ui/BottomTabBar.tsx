'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Network, FolderKanban, FileText, ListTodo } from 'lucide-react';

interface TabItem {
  href: string;
  /** Translation key under `nav.*` for the visible tab label. */
  labelKey: 'ontology' | 'projects' | 'docs' | 'settings';
  icon: typeof Network;
  /** pathname 이 이 prefix 들 중 하나로 시작하면 활성 탭. 빈 배열이면 정확히 href 와 일치할 때만. */
  matchPrefixes: ReadonlyArray<string>;
}

// 모바일 한정 하단 탭바. 메인 4개 destination만 노출 — 미니멀 모바일 결.
// "온톨로지 · 프로젝트 · 문서 · 정리" 4분할.
// Direction A 적용 후 / 가 ontology hub — 첫 탭 라벨/아이콘이 그 정체성을
// 노출. 토폴로지는 온톨로지의 출구 view 라 별도 탭이 아닌 OntologyView /
// OperationsNav 안의 sub-link 로 진입.
const TABS: ReadonlyArray<TabItem> = [
  { href: '/', labelKey: 'ontology', icon: Network, matchPrefixes: ['/ontology', '/topology'] },
  { href: '/projects/', labelKey: 'projects', icon: FolderKanban, matchPrefixes: ['/projects', '/project'] },
  // "문서" tab — vault picker. mission v2 가 cloud markdown 호스팅 surface
  // (`/knowledge/*`) 를 폐기한 후 모든 모드에서 docs vault 가 진입점.
  { href: '/docs/', labelKey: 'docs', icon: FileText, matchPrefixes: ['/docs'] },
  { href: '/settings/', labelKey: 'settings', icon: ListTodo, matchPrefixes: ['/settings'] },
];

// 탭바를 노출하지 않을 surface — 인증·온보딩·에러 화면처럼 사용자가
// "이동" 보다 "지금 이 화면 끝내기" 에 집중해야 하는 곳. pathname prefix 매칭.
const HIDDEN_PREFIXES: ReadonlyArray<string> = [
  '/login',
  '/signup',
  '/reset-password',
  '/dev',
  '/api',
];

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');
  const shouldHide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (shouldHide) return null;

  return (
    <nav
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
  if (tab.href === '/') {
    // 홈은 정확히 / 또는 /?... 일 때만 활성. /projects 같은 곳에서 같이 점등하지 않게.
    return pathname === '/' || pathname === '';
  }
  if (tab.matchPrefixes.length === 0) {
    return pathname === tab.href || pathname === tab.href.replace(/\/$/, '');
  }
  return tab.matchPrefixes.some((p) => pathname.startsWith(p));
}
