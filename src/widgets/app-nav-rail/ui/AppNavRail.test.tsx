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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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

vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
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
  it("starts directly with destinations instead of duplicating the brand in the rail", () => {
    mocks.pathname = "/topology";
    renderRail();
    expect(screen.queryByRole("link", { name: "Ontology Atlas" })).toBeNull();
    expect(screen.queryByText("Atlas")).toBeNull();
  });

  it("renders all 9 destinations with i18n labels", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-map")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-architecture")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-docs")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-library")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-projects")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-agents")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-mcp")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
    // The retired ERD builder (2026-07-24) — removed from the rail.
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

  it("renders the settingsSlot passed in at the bottom of the rail", () => {
    renderRail(<AppNavRail settingsSlot={<button type="button">설정 슬롯</button>} />);
    expect(screen.getByRole("button", { name: "설정 슬롯" })).toBeInTheDocument();
  });

  // Task ⑪ — LNB context carryover. If you select a node on the map and then
  // navigate to a document-vault item, that node's document should open immediately (no unrelated default screen).
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
    expect(screen.getByTestId("app-nav-rail-item-architecture")).toHaveAttribute(
      "href",
      "/architecture/?focus=main",
    );
    expect(screen.getByTestId("app-nav-rail-item-git")).toHaveAttribute(
      "href",
      "/git/?focus=main",
    );
  });
});

describe("Git destination preservation", () => {
  it("keeps Git beside the additive Architecture destination", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-architecture")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
  });

  it("shows the uncommitted-change badge only when there is something to record", () => {
    const { unmount } = renderRail(<AppNavRail gitDirtyCount={3} />);
    expect(screen.getByTestId("app-nav-rail-badge-git")).toHaveTextContent("3");
    unmount();

    renderRail(<AppNavRail gitDirtyCount={0} />);
    expect(screen.queryByTestId("app-nav-rail-badge-git")).not.toBeInTheDocument();
  });

  it("caps three-digit counts at 9+ to protect tile geometry", () => {
    renderRail(<AppNavRail gitDirtyCount={40} />);
    expect(screen.getByTestId("app-nav-rail-badge-git")).toHaveTextContent("9+");
  });
});
