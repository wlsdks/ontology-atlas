"use client";

import { useCallback, type ReactNode } from "react";
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
import { AtlasGitLauncherProvider } from "@/shared/lib/atlas-git-launcher";
import { AtlasGitPanelHost, NavRailGitTile } from "./NavRailGitTile";
import { useDataSourceMode } from "@/features/data-source-mode";
import { RouteFocusManager } from "@/shared/ui/route-focus-manager";

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
 * 높이는 의도적으로 강제하지 않는다 — 각 페이지가 이전에 소유하던 최상위
 * wrapper(`h-screen`/`h-dvh overflow-hidden`/`min-h-screen` 등, 캔버스 앱은
 * 고정 뷰포트, 목록/폼 페이지는 자연 스크롤)가 이제 `{children}` 안쪽에서
 * 그대로 그 높이 클래스를 유지한다. 이 row(`flex w-full`)와 콘텐츠 슬롯
 * (`flex-1 min-w-0 flex-col`, 높이 없음)은 투명한 pass-through 라 페이지가
 * 선언한 높이가 그대로 flex 행의 실제 높이를 결정하고, 레일은 기본
 * `align-items: stretch` 로 거기 맞춰 늘어난다 — 페이지별 스크롤/뷰포트
 * 계약을 바꾸지 않는다.
 *
 * `AgentConnectLauncherProvider` 도 여기서 상주한다 — 레일의 에이전트 타일이
 * 어느 페이지에서든 연결 시트를 "열려는 의도" 를 세우면, 지형도로 이동한 뒤에도
 * (레이아웃 상주라) 그 의도가 살아남아 HomePage 가 마운트 직후 소비한다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavRailShellProvider>
      <AgentConnectLauncherProvider>
        {/* #65 — 발자취(Atlas Git) 패널도 셸 상주. `<lg` 에서는 레일이 숨으므로
            지도의 크롬 타일이 같은 런처로 같은 패널을 연다. */}
        <AtlasGitLauncherProvider renderPanel={AtlasGitPanelHost}>
          <RouteFocusManager />
          <div className="flex w-full">
            <AppNavRailSlot />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </AtlasGitLauncherProvider>
      </AgentConnectLauncherProvider>
    </NavRailShellProvider>
  );
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
  // 발자취 타일은 항상 셸이 붙인다 — 페이지가 슬롯을 덮어써도 유틸 티어의
  // 개수가 화면마다 달라지지 않는다.
  const utilityTier = (
    <>
      <NavRailGitTile />
      {settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />}
    </>
  );

  return (
    <AppNavRail
      settingsSlot={utilityTier}
      hidden={hidden}
      contextHrefs={contextHrefs}
      onAgentTileActivate={onAgentTileActivate}
      agentConnectOpen={launcher.wantOpen}
    />
  );
}
