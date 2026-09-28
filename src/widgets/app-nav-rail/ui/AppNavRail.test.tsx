import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { MouseEventHandler, ReactNode } from "react";
import koMessages from "../../../../messages/ko.json";
import { beginMapNavigation, cancelMapNavigation } from "@/shared/lib/map-navigation-pending";
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

  it("renders eight destinations with ontology documents inside Library", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-map")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-architecture")).toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-item-docs")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-library")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-automations")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-insights")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-projects")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-agents")).toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-item-mcp")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-item-builder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-nav-rail-agent-status")).not.toBeInTheDocument();
  });

  it("draws only the destinations the folder's shape earns", () => {
    // A wiki without a map keeps only the wiki, agent, MCP and history doors.
    renderRail(<AppNavRail visibleDestinations={new Set(["library", "automations", "agents", "git"])} />);
    expect(screen.getByTestId("app-nav-rail-item-library")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-automations")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-agents")).toBeInTheDocument();
    expect(screen.getByTestId("app-nav-rail-item-git")).toBeInTheDocument();
    for (const hidden of ["map", "architecture", "docs", "insights", "projects"]) {
      expect(screen.queryByTestId(`app-nav-rail-item-${hidden}`)).not.toBeInTheDocument();
    }
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
   * How the map reacts to this signal is measured by `tests/e2e/nav-yield-map-frames.spec.ts`; this
   * checks the rail fires it.
   */
  it('emits the navigation signal only on clicks that actually navigate', () => {
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

  it("moves the active mark to the map on the press while the page it leaves stays current", () => {
    mocks.pathname = "/ontology/insights/";
    renderRail();
    act(() => {
      beginMapNavigation(vi.fn(), "/ontology/insights/");
    });
    try {
      expect(screen.getByTestId("app-nav-rail-item-map")).toHaveAttribute("data-active", "true");
      expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("data-active", "false");
      expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("aria-current", "page");
    } finally {
      act(() => cancelMapNavigation());
    }
    expect(screen.getByTestId("app-nav-rail-item-insights")).toHaveAttribute("data-active", "true");
  });

  it("renders the settingsSlot passed in at the bottom of the rail", () => {
    renderRail(<AppNavRail settingsSlot={<button type="button">설정 슬롯</button>} />);
    expect(screen.getByRole("button", { name: "설정 슬롯" })).toBeInTheDocument();
  });

  // A node selected on the map carries its document deep link to the docs item.
  it("carries the selected ontology document into Library with contextHrefs.docs when provided", () => {
    renderRail(
      <AppNavRail contextHrefs={{ docs: "/docs/?slug=capabilities/mcp-server" }} />,
    );
    expect(screen.getByTestId("app-nav-rail-item-library")).toHaveAttribute(
      "href",
      "/docs/?slug=capabilities/mcp-server&focus=main",
    );
  });

  it("falls back to the default Library surface with the reading-start marker", () => {
    renderRail();
    expect(screen.getByTestId("app-nav-rail-item-library")).toHaveAttribute(
      "href",
      "/library/?focus=main",
    );
  });

  it("keeps the marked default Library surface when contextHrefs.docs is undefined", () => {
    renderRail(<AppNavRail contextHrefs={{}} />);
    expect(screen.getByTestId("app-nav-rail-item-library")).toHaveAttribute(
      "href",
      "/library/?focus=main",
    );
  });

  it("opens the folder's only project when the shell says which one it is", () => {
    renderRail(<AppNavRail contextHrefs={{ projects: "/project/fallback/?slug=storefront" }} />);
    expect(screen.getByTestId("app-nav-rail-item-projects")).toHaveAttribute(
      "href",
      "/project/fallback/?slug=storefront&focus=main",
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
