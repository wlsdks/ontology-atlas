import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

/**
 * #65 — 레일 하단 유틸 티어(활동 · 기록 · 설정)는 **모든 화면에서 같다.**
 *
 * 예전엔 페이지가 `useNavRailSettingsSlot` 으로 손수 등록해야 했고, 공방이
 * 그걸 빠뜨려 그 화면만 아이콘 1개였다 (지도 3 · 문서함/인사이트/프로젝트 2 ·
 * 공방 1, opus5 검수 2026-07-25 실측). 셸이 기본을 소유하도록 바꿨으므로,
 * 슬롯을 아무도 주입하지 않아도 세 타일이 서 있어야 한다.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => "ko",
}));

vi.mock("@/features/docs-vault-local", () => ({
  // 번들 MCP 서버는 설치 앱에서만 보인다 — jsdom 은 웹 세션과 같은 자리다.
  useAgentServer: () => ({
    kind: "unavailable",
    launch: null,
    binaryPath: null,
    reason: "The bundled MCP server is only available in the installed app.",
  }),
  useLocalVault: () => ({ status: "idle", handle: null, manifest: null }),
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: null }),
}));

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => "static",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/ontology/studio",
  Link: ({ children }: { children?: unknown }) => children,
}));

describe("AppShell — 레일 하단 유틸 티어 (#65)", () => {
  it("페이지가 슬롯을 주입하지 않아도 활동·설정이 선다", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    const tier = screen.getByTestId("app-nav-rail-utility-tier");
    expect(screen.getByTestId("app-nav-rail-agent-status")).toBeInTheDocument();
    // 활동 · 설정(<details> 트리거) 두 자식.
    expect(tier.children.length).toBe(2);
  });

  it("기록은 유틸 타일이 아니라 목적지다 (2026-07-25 승격 — 입구 하나)", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    // 구 유틸 타일은 흡수됐다. 입구가 둘이면 #65 계열 혼란이 재발한다.
    // (목적지 항목 자체가 뜨는지는 `AppNavRail.test.tsx` 가 본다 — 이 파일의
    //  `@/i18n/navigation` 목이 `Link` 를 children-only 로 렌더해 testid 가
    //  사라지므로 여기서 단언하면 거짓 실패가 난다.)
    expect(screen.queryByTestId("app-nav-rail-git-tile")).not.toBeInTheDocument();
  });
});

describe("셸 칼럼 — 뷰포트 소유 계약", () => {
  it("셸이 뷰포트 높이를 잡고 본문만 스크롤한다", () => {
    // 페이지가 `--app-viewport-h` 를 기억해야 하는 구조는 #65 와 같은 drift 다.
    // 셸이 `h-dvh overflow-hidden` 을 소유하면 페이지는 `h-full` 만 쓰면 된다.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    const shell = container.querySelector(".h-dvh");
    expect(shell, "셸 루트가 뷰포트 높이를 잡아야 한다").not.toBeNull();
    expect(shell?.className).toContain("overflow-hidden");
  });

  it("본문 슬롯이 자식을 압축하지 않는다 — 스크롤 끝 여백 계약", () => {
    // 슬롯은 스크롤 컨테이너다. 페이지 루트가 슬롯을 채우려고 쓰는
    // `min-h-full` 은 flex 아이템의 자동 최소 크기를 덮어쓰므로, 압축을 막지
    // 않으면 내용이 길어질 때 페이지 박스가 뷰포트 높이로 줄고 하단 예약고가
    // 줄어든 박스 바닥에 갇힌다 (1512×950 실측: 다운로드 여백 0px · 768 에서
    // 프로젝트 상세 마지막 줄이 탭바 뒤로 17px).
    // jsdom 은 레이아웃을 하지 않아 픽셀은 못 본다 — 여기서는 처방이 제자리에
    // 있는지만 고정하고, 실제 여백은 `tests/e2e/scroll-end-gap.spec.ts` 가 잰다.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    const slot = container.querySelector(".overflow-y-auto");
    expect(slot, "본문 스크롤 슬롯이 있어야 한다").not.toBeNull();
    expect(
      slot?.className,
      "슬롯의 직계 자식은 압축되지 않아야 한다 — 페이지마다 shrink-0 을 기억하게 하면 다음 화면에서 또 빠진다",
    ).toContain("[&>*]:shrink-0");
  });

  it("앱 내장 터미널 손잡이가 없다 — 2026-07-26 제거", () => {
    // 회귀 차단: 에이전트를 돌리는 사람은 자기 터미널을 쓴다는 결정으로
    // 하단 도크를 걷어냈다. 손잡이가 되살아나면 그 결정이 조용히 뒤집힌 것이다.
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });
});
