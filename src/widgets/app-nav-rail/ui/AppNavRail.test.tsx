import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { MouseEventHandler, ReactNode } from "react";
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
  Link: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  } & Record<string, unknown>) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...rest}
    >
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

  it("renders all 6 destinations with i18n labels", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-map")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-docs")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-projects")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-agents")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
    // 은퇴한 ERD 빌더(2026-07-24) — 레일에서 제거됨.
    expect(screen.queryByTestId("app-nav-rail-item-builder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-agent-status")).not.toBeInTheDocument();
  });

  it("carries the destination reading-start intent across installed-app navigation", () => {
    window.sessionStorage.clear();
    renderRail();
    const insights = screen.getByTestId("app-nav-rail-item-insights");

    expect(insights).toHaveAttribute("href", "/ontology/insights/?focus=main");
    fireEvent.click(insights);

    expect(
      JSON.parse(
        window.sessionStorage.getItem("ontology-atlas:route-focus-intent") ?? "null",
      ),
    ).toMatchObject({ surfacePath: "/ontology/insights" });

    window.sessionStorage.clear();
    fireEvent.click(insights, { metaKey: true });
    expect(
      window.sessionStorage.getItem("ontology-atlas:route-focus-intent"),
    ).toBeNull();
  });

  /**
   * **이동 신호 배선** (2026-08-19 실측).
   *
   * 지도처럼 상시 rAF 루프를 가진 표면은 «떠나기로 한 화면» 을 계속 그리면
   * 새 화면의 첫 렌더와 프레임 예산을 다툰다 — CPU 4배에서 3D 2,000 노드
   * 출발이 529ms, 3,000 노드가 745ms 였다(같은 규모 2D 는 194ms). 처방은
   * shared 층 이벤트 하나이고, **지도가 그 신호에 어떻게 반응하는지는
   * `tests/e2e/nav-yield-map-frames.spec.ts` 가 잰다.** 이 검사는 나머지
   * 절반, 즉 «레일이 그 신호를 실제로 쏘는가» 를 지킨다. 둘이 있어야 회로가
   * 닫힌다 — 한쪽만 있으면 배선이 끊겨도 양쪽 다 초록이다.
   */
  it("이동이 성사되는 클릭에서만 이동 신호를 쏜다", () => {
    renderRail();
    const insights = screen.getByTestId("app-nav-rail-item-insights");
    const seen: Event[] = [];
    const listener = (event: Event) => seen.push(event);
    window.addEventListener("ontology-atlas:navigation-intent", listener);
    try {
      fireEvent.click(insights);
      expect(seen).toHaveLength(1);

      // 새 탭으로 여는 클릭은 이 화면을 떠나지 않는다 — 지도를 재울 이유가 없다.
      fireEvent.click(insights, { metaKey: true });
      expect(seen).toHaveLength(1);
    } finally {
      window.removeEventListener("ontology-atlas:navigation-intent", listener);
    }
  });

  it("marks the current route active via aria-current + data-active", () => {
    mocks.pathname = "/ontology/insights/";
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("app-nav-rail-item-map")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("app-nav-rail-item-map")).not.toHaveAttribute("aria-current");
  });

  it("renders the settingsSlot passed in at the bottom of the rail", () => {
    renderRail(<AppNavRail settingsSlot={<button type="button">설정 슬롯</button>} />);
    expect(screen.getByRole("button", { name: "설정 슬롯" })).toBeInTheDocument();
  });

  // 과제 ⑪ — LNB 컨텍스트 이월. 지도에서 노드를 선택한 채 문서함 항목으로
  // 이동하면 그 노드의 문서가 바로 열려야 한다(선택과 무관한 기본 화면 금지).
  it("overrides the docs item's href with contextHrefs.docs when provided", () => {
    renderRail(
      <AppNavRail contextHrefs={{ docs: "/docs/?slug=capabilities/mcp-server" }} />,
    );
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute(
      "href",
      "/docs/?slug=capabilities/mcp-server&focus=main",
    );
  });

  it("falls back to the default docs surface with the reading-start marker", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute(
      "href",
      "/docs/?focus=main",
    );
  });

  it("keeps the marked default docs surface when contextHrefs.docs is undefined", () => {
    renderRail(<AppNavRail contextHrefs={{}} />);
    expect(screen.getByTestId("app-nav-rail-item-docs")).toHaveAttribute(
      "href",
      "/docs/?focus=main",
    );
  });

  it("preserves every destination path while adding its reading-start marker", () => {
    renderRail(
      <AppNavRail contextHrefs={{ docs: "/docs/?slug=capabilities/mcp-server" }} />,
    );
    expect(screen.getByTestId("app-nav-rail-item-map")).toHaveAttribute(
      "href",
      "/topology/?focus=main",
    );
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute(
      "href",
      "/ontology/insights/?focus=main",
    );
    expect(screen.getByTestId("app-nav-rail-item-projects")).toHaveAttribute(
      "href",
      "/projects/?focus=main",
    );
    expect(screen.getByTestId("app-nav-rail-item-agents")).toHaveAttribute(
      "href",
      "/agents/?focus=main",
    );
    expect(screen.getByTestId("app-nav-rail-item-git")).toHaveAttribute(
      "href",
      "/git/?focus=main",
    );
  });
});

describe("발자취 목적지 (2026-07-25 승격)", () => {
  it("여섯 번째 목적지로 선다", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
  });

  it("미커밋 변경이 있으면 warning 뱃지가 뜨고, 없으면 소멸한다", () => {
    const { unmount } = renderRail(<AppNavRail gitDirtyCount={3} />);
    expect(screen.getByTestId("app-nav-rail-badge-git")).toHaveTextContent("3");
    unmount();

    // 0 이면 회색화가 아니라 **소멸** — ambient 신호는 없을 때 자리를 차지하지 않는다.
    renderRail(<AppNavRail gitDirtyCount={0} />);
    expect(screen.queryByTestId("app-nav-rail-badge-git")).not.toBeInTheDocument();
  });

  it("세 자리 카운트는 `9+` 로 막는다 (타일 지오메트리 보호)", () => {
    renderRail(<AppNavRail gitDirtyCount={40} />);
    expect(screen.getByTestId("app-nav-rail-badge-git")).toHaveTextContent("9+");
  });
});
