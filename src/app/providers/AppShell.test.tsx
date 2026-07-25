import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

/**
 * #65 — 레일 하단 유틸 티어(활동 · 발자취 · 설정)는 **모든 화면에서 같다.**
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
  it("페이지가 슬롯을 주입하지 않아도 활동·발자취·설정이 모두 선다", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    const tier = screen.getByTestId("app-nav-rail-utility-tier");
    expect(screen.getByTestId("app-nav-rail-agent-status")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-git-tile")).toBeInTheDocument();
    // 활동 · 발자취 · 설정(<details> 트리거) 세 자식.
    expect(tier.children.length).toBe(3);
  });
});
