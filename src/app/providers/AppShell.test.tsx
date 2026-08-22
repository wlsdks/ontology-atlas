import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

/**
 * The rail's bottom utility tier (activity, git, settings) is **the same on every screen.**
 *
 * Pages used to register it by hand via `useNavRailSettingsSlot`, and one page forgot,
 * leaving that screen with a single icon (measured 2026-07-25: map 3, docs/insights/projects 2,
 * that page 1). The shell now owns the default, so all three tiles must stand even when
 * nobody injects a slot.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => "ko",
}));

vi.mock("@/features/docs-vault-local", () => ({
  // The bundled MCP server is visible only in the installed app — jsdom is the same as a web session.
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
    // The fact under test is "the shell supplies the default slots", not the **number**
    // of children. It used to count `children.length === 2`, a proxy that broke the
    // moment one web-only element joined the tier (the "get the app" addition, 2026-07-28).
    // Check the **members**, not the count.
    expect(screen.getByTestId("app-nav-rail-agent-status")).toBeInTheDocument();
    expect(tier).toContainElement(screen.getByTestId("app-nav-rail-agent-status"));
    expect(tier.querySelector("details"), "설정 트리거가 없다").not.toBeNull();
  });

  it("기록은 유틸 타일이 아니라 목적지다 (2026-07-25 승격 — 입구 하나)", () => {
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );

    // The old utility tile was absorbed; two entrances reproduce the same confusion.
    // (Whether the destination entry itself appears is checked by `AppNavRail.test.tsx` —
    //  this file's `@/i18n/navigation` mock renders `Link` children-only, so the testid
    //  disappears and asserting it here would fail falsely.)
    expect(screen.queryByTestId("app-nav-rail-git-tile")).not.toBeInTheDocument();
  });
});

describe("셸 칼럼 — 뷰포트 소유 계약", () => {
  it("셸이 뷰포트 높이를 잡고 본문만 스크롤한다", () => {
    // Structure a page has to remember — such as `--app-viewport-h` — is exactly what
    // drifts. With the shell owning `h-dvh overflow-hidden`, a page needs only `h-full`.
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
    // The slot is a scroll container. The `min-h-full` a page root uses to fill it
    // overrides the flex item's automatic minimum size, so without blocking compression
    // the page box shrinks to viewport height as content grows and the bottom reserve is
    // trapped at the floor of the shrunken box (measured 1512×950: download gap 0px; at
    // 768 the last line of project detail sat 17px behind the tab bar).
    // jsdom does no layout, so pixels are invisible here — this pins only that the
    // prescription is in place, and `tests/e2e/scroll-end-gap.spec.ts` measures the real gap.
    const { container } = render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    /*
     * ⚠️ **Target it by name** (corrected 2026-08-20). This used to grab the first
     * `.overflow-y-auto`, and when the rail became eight destinations and gained scroll,
     * that selector grabbed **the rail's `<nav>`** and this check started measuring the
     * wrong element. A class can be shared by several elements, so "the first one with
     * that class" cannot be a contract.
     */
    const slot = container.querySelector('[data-testid="app-shell-body-slot"]');
    expect(slot, "본문 스크롤 슬롯이 있어야 한다").not.toBeNull();
    expect(slot?.className, "본문 슬롯이 스크롤 컨테이너가 아니다").toContain(
      "overflow-y-auto",
    );
    expect(
      slot?.className,
      "슬롯의 직계 자식은 압축되지 않아야 한다 — 페이지마다 shrink-0 을 기억하게 하면 다음 화면에서 또 빠진다",
    ).toContain("[&>*]:shrink-0");
  });

  it("앱 내장 터미널 손잡이가 없다 — 2026-07-26 제거", () => {
    // Regression guard: the bottom dock was removed on the decision that anyone running
    // an agent uses their own terminal. A handle reappearing means that decision was
    // quietly reversed.
    render(
      <AppShell>
        <div>page</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-terminal-handle")).not.toBeInTheDocument();
  });
});
