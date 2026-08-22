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
    // The retired ERD builder (2026-07-24) — removed from the rail.
    expect(screen.queryByTestId("app-nav-rail-item-builder")).not.toBeInTheDocument();
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
   * **The navigation-signal wiring** (measured 2026-08-19).
   *
   * A surface with a permanent rAF loop, like the map, competes for frame budget with
   * the new screen's first render if it keeps drawing «the screen you decided to
   * leave» — at 4× CPU throttling, departing a 3D 2,000-node map took 529ms and 3,000
   * nodes 745ms (2D at the same scale was 194ms). The prescription is one shared-layer
   * event, and **how the map reacts to that signal is measured by
   * `tests/e2e/nav-yield-map-frames.spec.ts`.** This check holds the other half —
   * «does the rail actually fire the signal». Both are needed to close the circuit;
   * with only one, a broken wire leaves both green.
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

      // A click that opens a new tab does not leave this screen — no reason to put the map to sleep.
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
      heartbeat: { agent: "codex-acp", state: "editing" },
    };
    renderRail();
    expect(screen.getByTestId("app-nav-rail-agent-dot")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-agent-status")).toHaveAttribute(
      "title",
      expect.stringContaining("Codex"),
    );
    expect(screen.getByTestId("app-nav-rail-agent-status")).not.toHaveAttribute(
      "title",
      expect.stringContaining("codex-acp"),
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

  // Owner report 2026-07-23 — the rail's icon size order (logo 26 / destination 24
  // plus label / utility 18). If the bottom utility tile (activity) uses the
  // destination size (--app-nav-rail-icon-size) as is, the regression where it looks
  // larger than the settings gear comes back.
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

  // Carrying LNB context forward. Moving to the docs vault item with a node selected
  // on the map must open that node's document immediately (no default screen
  // unrelated to the selection).
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

    // At 0 it **disappears** rather than greying out — an ambient signal takes no space when there is nothing to say.
    renderRail(<AppNavRail gitDirtyCount={0} />);
    expect(screen.queryByTestId("app-nav-rail-badge-git")).not.toBeInTheDocument();
  });

  it("세 자리 카운트는 `9+` 로 막는다 (타일 지오메트리 보호)", () => {
    renderRail(<AppNavRail gitDirtyCount={40} />);
    expect(screen.getByTestId("app-nav-rail-badge-git")).toHaveTextContent("9+");
  });
});
