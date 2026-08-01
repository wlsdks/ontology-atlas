"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";
import {
  AGENT_CONNECT_ROUTE_HREF,
  AgentConnectLauncherProvider,
  useAgentConnectLauncher,
} from "@/widgets/agent-connect";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  DestinationGuide,
  GuideReplayProvider,
  applyGuideOverride,
} from "@/features/guided-tour";
import { UpdateToast, useAppUpdate } from "@/features/app-update";
import { useLocalVault } from "@/features/docs-vault-local";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { isGatewaySurface, resolveActiveNavDestination } from "@/shared/lib/nav-destination";
import { RouteFocusManager } from "@/shared/ui/route-focus-manager";
import { useHydrated } from "@/shared/lib/use-hydrated";

/**
 * perf/persistent-shell — 레일(AppNavRail)을 8개 페이지 각각의 개별 마운트
 * (rail-rollout, #377)에서 `app/[locale]/layout.tsx` 상주로 승격한 진짜 SPA
 * 셸. 이동 전/후 프로덕션 정적 서빙(:3156) 진단 결과: 클릭은 이미 Next.js
 * client-side RSC 전환(`__next.*.txt` payload, `window` 전역 생존 확인)이라
 * 풀 문서 리로드는 아니었다 — 그런데도 페이지 트리가 통째로 unmount/remount
 * 되면서 레일 DOM도 매번 새로 생성돼(주입한 data attribute 가 이동 후
 * 사라짐) "깜빡이며 로딩되는" 체감을 만들었다. 레일을 라우트 트리 바깥,
 * layout 레벨로 옮기면 콘텐츠 영역만 교체되고 레일은 리액트 identity 를
 * 유지한다.
 *
 * **높이 계약 (2026-07-26 개정 — 종전 "높이는 강제하지 않는다" 는 폐기).**
 * 예전에는 각 페이지가 최상위 wrapper 로 뷰포트 높이를 직접 주장했고
 * (`h-screen` / `min-h-screen`), 셸은 투명한 pass-through 였다. 그 모델은
 * 셸이 본문 아래에 무엇을 더 세우는 순간 깨진다 — 페이지가 100vh 를
 * 주장하면 셸 칼럼이 `100vh + 그것` 이 되어 아래 표면이 화면 밖으로
 * 밀린다(실측: 보이는 픽셀 0).
 *
 * 그래서 **뷰포트 높이는 셸이 소유한다**: 셸이 `h-dvh overflow-hidden` 칼럼을
 * 잡고 본문 슬롯만 스크롤한다. 페이지 루트는 `h-full` / `min-h-full` 로
 * 슬롯을 채우기만 하면 되고, 셸이 아래에 무엇을 두는지 알 필요가 없다 —
 * 페이지가 기억해야 하는 구조는 #65 계열의 drift 를 부른다.
 * 새 페이지에서 `h-screen`/`min-h-screen` 은 결함이다.
 *
 * `AgentConnectLauncherProvider` 도 여기서 상주한다 — 레일의 에이전트 타일이
 * 어느 페이지에서든 연결 시트를 "열려는 의도" 를 세우면, 지형도로 이동한 뒤에도
 * (레이아웃 상주라) 그 의도가 살아남아 HomePage 가 마운트 직후 소비한다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useGuideOverride();
  return (
    <NavRailShellProvider>
      {/* 2026-07-25 — 기록 모달 런처 제거. 목적지(`/git/`)가 lg+ 레일과
          `<lg` 크롬 타일 양쪽에서 같은 표면을 담당하므로 셸에 상주하는 모달이
          더는 필요 없다(런처·패널 호스트·구 레일 타일 전부 도달 불가였다). */}
      <AgentConnectLauncherProvider>
        <GuideReplayProvider>
          <RouteFocusManager />
          <ShellColumn>{children}</ShellColumn>
        </GuideReplayProvider>
      </AgentConnectLauncherProvider>
    </NavRailShellProvider>
  );
}

/**
 * `?guides=off|reset` 를 **자식이 렌더되기 전에** 적용한다 (감사 세션용).
 *
 * lazy state 초기화인 이유: 안내 표면들은 자기 state 초기화/effect 에서
 * localStorage 를 읽는데, React 는 부모 렌더 → 자식 렌더 → 자식 effect →
 * 부모 effect 순으로 돈다. 그래서 여기서 `useEffect` 를 쓰면 **이미 늦어**
 * 안내가 한 프레임 떴다가 사라지고, 그 한 프레임이 정확히 모션 감사가 재는
 * 프레임이다. 초기화 함수는 부모 **렌더 중**에 돌아 자식보다 먼저다.
 *
 * 부수효과를 렌더에서 내는 것은 일반적으로 피해야 하지만, 이 쓰기는
 * 멱등이고(같은 키에 같은 값) StrictMode 이중 렌더에서도 결과가 같다.
 */
function useGuideOverride(): void {
  useState(() => {
    if (typeof window === "undefined") return null;
    return applyGuideOverride(window.location.search);
  });
}

/**
 * 셸 본문 — 레일 + 스크롤되는 본문 슬롯 + 목적지 안내.
 *
 * 하단에 앱 내장 터미널 도크가 살던 자리다. 2026-07-26 소유자 결정으로
 * 걷어냈다 — 에이전트를 돌리는 사람은 자기 터미널을 켜고, 앱이 내주던
 * 유일한 이점(같은 폴더에서 지도 옆에 뜬다)은 볼트 워처가 프로세스 위치와
 * 무관하게 이미 주고 있었다. 셸이 `h-dvh` 칼럼을 소유하는 계약은 그대로
 * 남는다 — 페이지들이 이미 그 위에 서 있다.
 */
function ShellColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const surface = resolveActiveNavDestination(pathname);

  // 목적지 안내를 띄울 화면. 지도는 자기 8단계 여정을 직접 소유하므로 제외하고,
  // 프로젝트는 **목록에서만** 띄운다 — `/project/<slug>` 상세도 레일에서는 같은
  // 목적지로 켜지지만 안내 문구("카드로 서요")가 가리키는 화면이 아니다.
  const guideDestination =
    !surface || surface === "map"
      ? null
      : surface === "projects" && !resolveIsProjectListPath(pathname)
        ? null
        : surface;

  return (
    // 뷰포트 소유권은 **셸**이 갖는다. 토큰(`--app-viewport-h`)을 만들어 **각
    // 페이지가 쓰도록** 하는 방법도 있었지만, 그건 "페이지가 기억해야 하는
    // 구조" 라 #65(레일 유틸 티어가 화면마다 1/2/3 개였던 결함)와 같은 drift 를
    // 부른다. 셸이 `h-dvh` 를 잡고 본문을 스크롤 영역으로 가두면 어떤 페이지도
    // 아무것도 몰라도 된다.
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <AppNavRailSlot />
        {/* 본문 슬롯은 **스크롤 컨테이너**다 — 그러니 자기 자식을 압축하면 안 된다.
            아래 자식 변형이 그 계약이다. 페이지 루트는 슬롯을 채우려고
            `min-h-full` 을 쓰는데, 그 명시적 min-height 는 flex 아이템의 자동
            최소 크기(= 내용 높이)를 덮어쓴다. 그래서 내용이 뷰포트보다 길어지면
            flex 가 페이지 박스를 뷰포트 높이까지 **줄여** 버렸고, 내용은 visible
            overflow 로 삐져나와 스크롤은 되는데 페이지의 하단 패딩이 줄어든 박스
            바닥에 붙어 스크롤 끝에서 여백이 사라졌다 (1512×950 실측 · 결함 당시:
            프로젝트 목록 내용 1368 / 박스 950 / 끝 여백 0px, 다운로드 2334 / 950 /
            0px, 프로젝트 상세·인사이트 동일 형태).
            페이지마다 `shrink-0` 을 기억하게 하는 처방은 #65 계열 drift 를 부른다 —
            다음에 만드는 화면이 또 빠뜨린다. 스크롤 컨테이너를 소유한 셸이 한 번
            선언한다. 자식이 늘어나는 건 그대로 두므로(`grow` 미변경) 짧은 내용의
            세로 중앙 정렬과 `h-full` 페이지는 영향받지 않는다. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0">
          {children}
        </div>
      </div>

      {/* 목적지 첫 방문 안내 (2026-07-26) — 지도에만 있던 안내를 나머지 다섯
          목적지로 넓힌다. 셸이 소유하는 이유: 페이지마다 손으로 마운트하게
          하면 하나가 빠져도 아무도 모른다(#65 계열 drift).
          `key` 로 목적지마다 remount — 이동 중 이전 화면의 카드가 남지 않는다.
          지도는 캔버스 노드 앵커·인터랙티브 클릭이 있는 8단계 여정이라
          HomePage 가 계속 직접 소유한다(여기서는 `null`). */}
      <DestinationGuide key={guideDestination ?? "none"} destination={guideDestination} />

      {/* 업데이트 알림 (2026-07-27) — 셸이 소유한다. 페이지마다 마운트하게 하면
          어떤 화면에서는 갱신을 못 만나고, 그 화면을 주로 쓰는 사람은 영영
          구버전에 머문다. 데스크톱 셸이 아니면 훅이 스스로 아무것도 하지 않으므로
          여기서 분기하지 않는다 — 조건을 두 곳에 두면 한쪽이 드리프트한다. */}
      <AppUpdateSurface />
    </div>
  );
}

/** 프로젝트 **목록** 화면인가 — `/project/<slug>` 상세·편집은 아니다. */
function resolveIsProjectListPath(pathname: string): boolean {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "").startsWith("/projects");
}

/** `/` 와 `/topology*` 는 둘 다 HomePage(연결 시트 소유자)를 렌더한다. */
function isTopologyHubPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/topology");
}

function AppNavRailSlot() {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellValue();
  const launcher = useAgentConnectLauncher();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();

  // 관문 라우트는 워크벤치 크롬(좌측 레일)을 쓰지 않는다 (2026-07-28 소유자
  // 확정). `hidden` prop 은 언마운트가 아니라 `lg:hidden` 이라
  // persistent-shell 의 DOM identity 계약을 지키면서 레이아웃에서만 빠진다.
  //
  // **셸이 판정하는 이유**: 페이지가 `setHidden(true)` 를 부르는 방식이면
  // ① 첫 프레임에 레일이 그려졌다 사라지는 깜빡임이 생기고 ② 다음에 만드는
  // 관문 표면이 그 호출을 빠뜨린다(공방이 유틸 슬롯 등록을 빠뜨렸던 #65
  // 계열). 경로 판정은 렌더 중에 끝난다.
  // `/` 는 **웹 방문자에게만** 관문(얼굴)이다 — 볼트를 연 사람과 설치된 앱에는
  // 그대로 작업 진입점이라, 판정에 방문자 맥락이 든다. 단일 출처는
  // `isGatewaySurface`(같은 함수를 `RootEntryPage` 도 쓴다).
  // ⚠️ `isDesktopShell()` 은 **브라우저만 아는 사실**이다. 정적 프리렌더에는
  // `window` 가 없어 항상 false 이고, 그 값이 `lg:hidden` 으로 HTML 에 구워지면
  // **하이드레이션이 그 속성을 고쳐 주지 않는다** — 렌더 함수는 옳은데 화면은
  // 틀린 채로 남는다. 설치된 앱이 `/` 를 그 HTML 로 열기 때문에 좌측 레일이
  // 영구히 사라졌다(2026-08-01 실측: 같은 주소도 클라이언트 내비로 들어가면
  // 정상이었다). `useHydrated()` 가 하이드레이션 뒤 한 번의 리렌더를 보장한다.
  const hydrated = useHydrated();
  const gateway = isGatewaySurface(pathname, {
    hasVault: Boolean(vault.manifest),
    desktop: hydrated && isDesktopShell(),
    vaultKnown: vault.restoreAttempted,
  });

  // P4-② 분기(TopologyIndexPanel 푸터와 동일 계약) — 연결됨: 활동
  // 다이제스트(인사이트)로. 미연결/stale: 연결 시트를 여는 전역 의도를 세운다.
  // 시트 본체는 HomePage 소유이므로 지형도 밖이면 지형도로 이동 —
  // launcher.wantOpen 이 레이아웃 상주라 도착한 HomePage 가 곧바로 소비한다.
  const onAgentTileActivate = useCallback(
    (connected: boolean) => {
      if (connected) {
        router.push("/ontology/insights/");
        return;
      }
      launcher.open();
      if (!isTopologyHubPath(pathname)) {
        router.push(AGENT_CONNECT_ROUTE_HREF);
      }
    },
    [launcher, router, pathname],
  );

  // #65 — 레일 하단 유틸 티어는 셸이 기본으로 채운다. 예전엔 페이지마다
  // `useNavRailSettingsSlot(<AppSettingsMenu triggerVariant="rail-tile" />)` 를
  // 손으로 등록해야 했고, **공방(OntologyStudioPage)이 그걸 빠뜨려** 그 화면만
  // 하단에 아이콘 1개(에이전트)만 남았다 (지도 3 · 문서함/인사이트/프로젝트 2 ·
  // 공방 1, opus5 검수 2026-07-25 실측). 페이지가 기억해야 하는 구조가 drift 의
  // 원인이므로 기본값을 셸로 올린다 — 페이지는 특별한 슬롯이 필요할 때만
  // 덮어쓴다.
  // 뱃지 카운트 — 목적지와 **같은 훅**을 읽는다(값이 갈리면 목록은 비었는데
  // 숫자가 남는 신뢰 사고가 난다). 세션 changeset 기준이라 웹/데스크톱 모두
  // 동작한다 — 데스크톱 정밀 카운트(`git_status.changedCount`)는 후속.
  const { changeset: gitChangeset } = useAtlasGitContext();
  const gitDirtyCount = gitChangeset.touchedNodeIds.size;

  // 2026-07-25 — 기록은 **목적지로 승격**됐고 이 유틸 타일은 흡수됐다. 입구가
  // 둘이면(타일 + 목적지) #65 와 같은 계열의 혼란이 재발한다. 미커밋 변경 수는
  // 목적지 아이콘의 warning 뱃지로 옮겼다.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;

  return (
    <AppNavRail
      settingsSlot={utilityTier}
      hidden={hidden || gateway}
      contextHrefs={contextHrefs}
      gitDirtyCount={gitDirtyCount}
      onAgentTileActivate={onAgentTileActivate}
      agentConnectOpen={launcher.wantOpen}
    />
  );
}

/**
 * 훅과 표면을 한 겹으로 묶는다. `AppShell` 이 업데이트 상태 기계를 직접 들고
 * 있으면, 셸이 리렌더될 때마다 그 상태가 셸 전체를 다시 그리게 된다.
 */
function AppUpdateSurface() {
  const { phase, install, restart, dismiss } = useAppUpdate();
  return (
    <UpdateToast phase={phase} onInstall={install} onRestart={restart} onDismiss={dismiss} />
  );
}
