"use client";

import type { ReactNode } from "react";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";

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
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavRailShellProvider>
      <div className="flex w-full">
        <AppNavRailSlot />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </NavRailShellProvider>
  );
}

function AppNavRailSlot() {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellValue();
  return (
    <AppNavRail
      settingsSlot={settingsSlot ?? undefined}
      hidden={hidden}
      contextHrefs={contextHrefs}
    />
  );
}
