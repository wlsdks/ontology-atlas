'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, BookOpen, Download, FolderKanban, Map as MapIcon } from 'lucide-react';
import { useLocalVault } from '@/features/docs-vault-local';
import { resolveActiveNavDestination, type AppNavDestinationId } from '@/shared/lib/nav-destination';
import { shouldHideBottomTabBar } from '../lib/is-tab-active';
import { shouldShowGetAppTile } from '@/shared/lib/show-get-app-tile';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';

/** 런타임은 로드 뒤 바뀌지 않는다 — 구독은 형식상 필요할 뿐이라 no-op. */
const subscribeToRuntime = () => () => {};
/** 서버(프리렌더)에서는 창이 없어 **모른다**. `false`(=웹)로 단정하지 않는다. */
const getServerRuntimeSnapshot = (): boolean | null => null;

interface TabItem {
  id: AppNavDestinationId;
  href: string;
  /** Translation key under `navRail.*` — same copy as the desktop rail so
   *  mobile and desktop read as one nav system, not two. */
  labelKey: AppNavDestinationId;
  icon: typeof MapIcon;
}

// 모바일 한정 하단 탭바 — 데스크톱 `AppNavRail` (lg+) 의 코어 4목적지를 공유한다
// (feat/rail-rollout, 3-체계 → 1-체계 통합). 공방은 몰입형 쓰기 표면이라
// 데스크톱 레일 전용이고, 은퇴한 ERD 빌더 탭은 제거됐다(2026-07-24, 공방이
// 흡수). active 판정도 `resolveActiveNavDestination` 을 공유해 두 위젯이 절대
// 갈라지지 않는다.
const TABS: ReadonlyArray<TabItem> = [
  { id: 'map', href: '/topology/', labelKey: 'map', icon: MapIcon },
  { id: 'docs', href: '/docs/', labelKey: 'docs', icon: BookOpen },
  { id: 'insights', href: '/ontology/insights/', labelKey: 'insights', icon: BarChart3 },
  { id: 'projects', href: '/projects/', labelKey: 'projects', icon: FolderKanban },
];

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');
  const tRail = useTranslations('navRail');
  const vault = useLocalVault();

  /**
   * 「앱 받기」 — `<lg` 웹의 유일한 다운로드 경로.
   *
   * 실측(2026-07-28): 레일이 `lg:flex` 라 390·768 에서 보이는 `/download` 링크가
   * **0개**였다. 모바일·태블릿 웹 방문자는 다운로드로 갈 길이 아예 없었다.
   * 소유자 결정으로 탭바의 다섯 번째 자리를 내준다.
   *
   * 목적지가 아니라 **유틸리티**라 `TABS` 배열 밖에 둔다 — 활성 판정
   * (`resolveActiveNavDestination`)은 손대지 않는다. `/download` 는 탭바를
   * 숨기는 라우트라(`shouldHideBottomTabBar`) 이 항목이 활성이 되는 상태는
   * 애초에 존재하지 않는다.
   *
   * **훅은 조기 반환 위**에 둔다 — 탭바는 라우트에 따라 `null` 을 돌려주므로,
   * 아래에 두면 렌더마다 훅 순서가 달라진다.
   */
  const desktopRuntime = useSyncExternalStore(
    subscribeToRuntime,
    isTauriVaultRuntime,
    getServerRuntimeSnapshot,
  );
  const showGetApp = shouldShowGetAppTile({
    mounted: desktopRuntime !== null,
    isDesktopApp: desktopRuntime === true,
  });

  if (shouldHideBottomTabBar(pathname, vault.status === 'loaded')) {
    return null;
  }

  const activeId = resolveActiveNavDestination(pathname);


  return (
    <nav
      data-tabbar="primary"
      data-tabbar-min-height-token="--topology-bottom-tab-min-height"
      data-tabbar-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
      data-tabbar-surface-token="--topology-bottom-tab-surface"
      data-tabbar-border-token="--topology-bottom-tab-border"
      aria-label={t('primaryAriaLabel')}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[color:var(--topology-bottom-tab-border)] bg-[color:var(--topology-bottom-tab-surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_36px_var(--color-shadow-a35)] lg:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeId === tab.id;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-active={active ? 'true' : 'false'}
            className={
              active
                ? 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-indigo-accent)] transition-colors active:bg-[color:var(--color-indigo-a08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
                : 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors active:bg-[color:var(--color-overlay-1)] active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
            }
          >
            {active ? (
              <span
                aria-hidden
                // 글로우 없음 — 인디고 선 자체가 트랙 위에서 3:1 을 넘는다.
                // 종전의 `0 0 12px` 인디고 헤일로는 헌장이 이름으로 금지한
                // 「glow-like boxShadow 0 0 ring」이었는데, 값 안에 `var(` 가
                // 있어서 그림자 lint 의 사정거리 밖에 있었다(같은 PR 에서 룰을
                // 좁혀 색 있는 헤일로만 잡게 했다).
                className="absolute top-1 h-0.5 w-6 rounded-full bg-[color:var(--color-indigo-line-a90)]"
                data-active-indicator="true"
              />
            ) : null}
            <span
              className={
                active
                  ? 'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a10)] shadow-[0_0_0_1px_var(--color-indigo-line-a06)_inset]'
                  : 'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-transparent transition-colors'
              }
              data-tab-icon-shell={active ? 'active' : 'idle'}
            >
              <Icon size={17} aria-hidden />
            </span>
            <span className="text-caption font-[var(--font-weight-signature)] leading-none">{tRail(tab.labelKey)}</span>
          </Link>
        );
      })}

      {/*
        다섯 번째 자리 — 목적지가 아니라 **웹 전용 유틸리티**다. `TABS` 배열
        밖에 두어 활성 판정을 손대지 않는다. 라벨과 아이콘은 레일의 같은
        타일과 한 문법을 쓴다 — 폭이 달라도 사용자가 배우는 것은 하나다.

        터치 타깃은 형제 탭과 같은 클래스를 그대로 받는다(`--topology-bottom-tab-
        min-height` + coarse 포인터 계약) — 유틸리티라고 작게 만들면 그게
        `<lg` 에서 가장 누르기 어려운 항목이 된다.
      */}
      {showGetApp ? (
        <Link
          href="/download/"
          title={tRail('getAppTitle')}
          data-testid="bottom-tab-get-app"
          className="relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors active:bg-[color:var(--color-overlay-1)] active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-transparent transition-colors">
            <Download size={17} aria-hidden />
          </span>
          <span className="text-caption font-[var(--font-weight-signature)] leading-none">
            {tRail('getApp')}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
