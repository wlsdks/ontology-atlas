import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import koMessages from "../../../../messages/ko.json";
import { AppNavRail } from "./AppNavRail";

const mocks = vi.hoisted(() => ({
  pathname: "/topology",
  agentActivityStatus: {
    exists: false,
    valid: false,
    stale: false,
    ageMs: null,
    heartbeat: null,
  } as {
    exists: boolean;
    valid: boolean;
    stale: boolean;
    ageMs: number | null;
    heartbeat: {
      agent: string;
      state: string;
      focus?: { ontologySlug: string | null };
    } | null;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => mocks.pathname,
}));

vi.mock("@/features/docs-vault-local", () => ({
  useLocalVault: () => ({ agentActivityStatus: mocks.agentActivityStatus }),
}));

function renderRail(ui = <AppNavRail />) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AppNavRail", () => {
  it("renders the always-on 'Atlas' wordmark under the brand mark", () => {
    mocks.pathname = "/topology";
    renderRail();
    const wordmark = screen.getByText("Atlas");
    expect(wordmark).toBeInTheDocument();
    // aria-hidden so it doesn't double-announce the logo link's "Ontology Atlas".
    expect(wordmark).toHaveAttribute("aria-hidden", "true");
    expect(wordmark).toHaveAttribute("translate", "no");
  });

  it("renders all 5 destinations with i18n labels", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-map")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-docs")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-builder")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-projects")).toBeInTheDocument();
  });

  it("marks the current route active via aria-current + data-active", () => {
    mocks.pathname = "/ontology/insights/";
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("app-nav-rail-item-map")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("app-nav-rail-item-map")).not.toHaveAttribute("aria-current");
  });

  it("hides the agent activity dot when there is no fresh heartbeat", () => {
    mocks.pathname = "/topology";
    mocks.agentActivityStatus = {
      exists: false,
      valid: false,
      stale: false,
      ageMs: null,
      heartbeat: null,
    };
    renderRail();
    expect(screen.queryByTestId("app-nav-rail-agent-dot")).not.toBeInTheDocument();
  });

  it("shows the agent activity dot when the heartbeat is valid and not stale", () => {
    mocks.agentActivityStatus = {
      exists: true,
      valid: true,
      stale: false,
      ageMs: 30_000,
      heartbeat: { agent: "claude", state: "editing" },
    };
    renderRail();
    expect(screen.getByTestId("app-nav-rail-agent-dot")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-agent-status")).toHaveAttribute(
      "title",
      expect.stringContaining("claude"),
    );
  });

  it("appends 'last activity: {slug} · {age}' to the title when the heartbeat reports a focus slug + age", () => {
    mocks.agentActivityStatus = {
      exists: true,
      valid: true,
      stale: false,
      ageMs: 45_000,
      heartbeat: {
        agent: "claude",
        state: "editing",
        focus: { ontologySlug: "capabilities/agent-live-activity-contract" },
      },
    };
    renderRail();
    expect(screen.getByTestId("app-nav-rail-agent-status")).toHaveAttribute(
      "title",
      expect.stringContaining(
        "마지막 활동: capabilities/agent-live-activity-contract · 45s 전",
      ),
    );
  });

  it("omits the last-activity suffix when the heartbeat has no focus slug", () => {
    mocks.agentActivityStatus = {
      exists: true,
      valid: true,
      stale: false,
      ageMs: 45_000,
      heartbeat: { agent: "claude", state: "editing", focus: { ontologySlug: null } },
    };
    renderRail();
    expect(screen.getByTestId("app-nav-rail-agent-status")).not.toHaveAttribute(
      "title",
      expect.stringContaining("마지막 활동"),
    );
  });

  it("renders the settingsSlot passed in at the bottom of the rail", () => {
    renderRail(<AppNavRail settingsSlot={<button type="button">설정 슬롯</button>} />);
    expect(screen.getByRole("button", { name: "설정 슬롯" })).toBeInTheDocument();
  });

  // 소유자 실보고 2026-07-23 — 레일 아이콘 사다리(로고 26 / 목적지 24+라벨 /
  // 유틸 18). 하단 유틸 타일(활동)이 목적지 크기(--app-nav-rail-icon-size)를
  // 그대로 쓰면 설정 기어보다 커 보이는 회귀가 재발한다.
  it("keeps the agent utility tile icon on the utility ladder (--app-nav-rail-utility-icon-size), below the destination tier", () => {
    renderRail();
    const agentIcon = screen
      .getByTestId("app-nav-rail-agent-status")
      .querySelector("svg");
    expect(agentIcon?.getAttribute("class") ?? "").toContain(
      "--app-nav-rail-utility-icon-size",
    );
    const destinationIcon = screen
      .getByTestId("app-nav-rail-item-map")
      .querySelector("svg");
    expect(destinationIcon?.getAttribute("class") ?? "").toContain(
      "--app-nav-rail-icon-size",
    );
  });

  // 과제 ⑪ — LNB 컨텍스트 이월. 지도에서 노드를 선택한 채 문서함 항목으로
  // 이동하면 그 노드의 문서가 바로 열려야 한다(선택과 무관한 기본 화면 금지).
  it("overrides the docs item's href with contextHrefs.docs when provided", () => {
    renderRail(
      <AppNavRail contextHrefs={{ docs: "/docs/?slug=capabilities/mcp-server" }} />,
    );
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute(
      "href",
      "/docs/?slug=capabilities/mcp-server",
    );
  });

  it("falls back to the default '/docs/' href when contextHrefs is absent", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute("href", "/docs/");
  });

  it("falls back to the default '/docs/' href when contextHrefs.docs is undefined", () => {
    renderRail(<AppNavRail contextHrefs={{}} />);
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute("href", "/docs/");
  });

  it("leaves every other destination's href unchanged when contextHrefs.docs is set", () => {
    renderRail(
      <AppNavRail contextHrefs={{ docs: "/docs/?slug=capabilities/mcp-server" }} />,
    );
    expect(screen.getByTestId("app-nav-rail-item-map")).toHaveAttribute("href", "/topology/");
    expect(screen.getByTestId("app-nav-rail-item-builder")).toHaveAttribute(
      "href",
      "/ontology/edit/",
    );
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute(
      "href",
      "/ontology/insights/",
    );
    expect(screen.getByTestId("app-nav-rail-item-projects")).toHaveAttribute(
      "href",
      "/projects/",
    );
  });
});
