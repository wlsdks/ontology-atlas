import { fireEvent, render, screen } from "@testing-library/react";
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

describe("터미널 도크 — 셸 소유 계약 (#79)", () => {
  it("여는 버튼이 보인다 — 단축키만 있으면 없는 기능이다", () => {
    // 소유자 실보고: "터미널을 여는 버튼이 없는데?" ⌃` 만 있으면 발견 불가능해
    // 사실상 존재하지 않는 기능이다. 손잡이의 존재가 계약이다.
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    // 이 파일의 next-intl 목은 키를 그대로 돌려준다 — 라벨 문구가 아니라
    // 손잡이가 있고 단축키를 새겼는지가 검사 대상이다.
    const handle = screen.getByTestId("agent-terminal-handle");
    expect(handle).toHaveTextContent("title");
    expect(handle).toHaveTextContent("⌃`");
  });

  it("손잡이를 누르면 손잡이가 사라진다 — 그 자리를 도크 헤더가 이어받는다", () => {
    // 셸의 계약은 "손잡이 ↔ 도크가 같은 자리를 번갈아 쓴다" 까지다. 도크 내부가
    // 무엇을 그리는지는 도크 자신의 테스트가 본다(웹 강등 · 볼트 없음 등).
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByTestId("agent-terminal-handle"));
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });

  it("셸이 뷰포트를 소유한다 — 도크가 문서 흐름에 밀려나지 않게", () => {
    // 소유자 실보고: "스크롤을 맨 밑으로 내려야 터미널이 나오는데.."
    // 페이지가 `--app-viewport-h` 를 기억해야 하는 구조는 #65 와 같은 drift 다.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    const shell = container.querySelector(".h-dvh");
    expect(shell, "셸 루트가 뷰포트 높이를 잡아야 한다").not.toBeNull();
    expect(shell?.className).toContain("overflow-hidden");
  });
});
