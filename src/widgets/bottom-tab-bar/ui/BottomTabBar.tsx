'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map as MapIcon, FolderKanban, FileText, ListTodo } from 'lucide-react';

interface TabItem {
  href: string;
  label: string;
  icon: typeof MapIcon;
  /** pathname 이 이 prefix 들 중 하나로 시작하면 활성 탭. 빈 배열이면 정확히 href 와 일치할 때만. */
  matchPrefixes: ReadonlyArray<string>;
}

// 모바일 한정 하단 탭바. 메인 4개 destination만 노출 — 미니멀 모바일 결.
// "지도 · 프로젝트 · 문서 · 정리(설정·진단)" 4분할로 정보 구조를 한 번에 잡아준다.
const TABS: ReadonlyArray<TabItem> = [
  { href: '/', label: '지도', icon: MapIcon, matchPrefixes: [] },
  { href: '/projects/', label: '프로젝트', icon: FolderKanban, matchPrefixes: ['/projects', '/project'] },
  // "문서" tab 은 docs / knowledge / review / ontology 모두 active. ontology
  // 는 별도 5번째 탭을 만들지 않는다 — 4 분할 폭 보존. /knowledge hub 에 진입
  // 카드로 발견. /docs 는 진안 일상 vault — 같은 "문서" 탭 활성으로 위치
  // 손실 없게 (Fire 1 — BottomTabBar 회귀).
  { href: '/knowledge/', label: '문서', icon: FileText, matchPrefixes: ['/knowledge', '/review', '/ontology', '/docs'] },
  { href: '/settings/', label: '정리', icon: ListTodo, matchPrefixes: ['/diagnostics', '/settings'] },
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
  const shouldHide = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (shouldHide) return null;

  return (
    <nav
      aria-label="주요 메뉴"
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
            <span className="text-[10px] font-[var(--font-weight-signature)] leading-none">{tab.label}</span>
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
