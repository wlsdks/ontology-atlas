import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={prefetch} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/project-data-source", () => ({
  useProjects: () => ({
    projects: [
      {
        slug: "ontology-atlas",
        name: "ontology-atlas",
        description: "Local-first ontology workbench",
        tags: [],
        stack: [],
        links: [],
        dependencies: [],
        screenshots: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    ],
    loaded: true,
    error: null,
    mode: "static",
  }),
  useVaultDocs: () => [
    {
      slug: "capabilities/mcp-server",
      path: "docs/ontology/capabilities/mcp-server.md",
      title: "MCP Server",
      tags: [],
      // Both production paths fill `doc.description` only from that frontmatter key — the no-excerpt rule
      // reads frontmatter too.
      frontmatter: { kind: "capability", description: "write 도구로 확장" },
      headings: [],
      excerpt: "",
      description: "write 도구로 확장",
      wordCount: 0,
      updatedAt: "2026-07-18T09:00:00.000Z",
      linksOut: [],
    },
  ],
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({
    insight: {
      nodes: [
        node("project:ontology-atlas", "project", []),
        node("domain:domains/views", "domain", ["ontology-atlas"], "Views"),
        node("capability:capabilities/mcp-server", "capability", ["ontology-atlas"], "MCP Server"),
        node("element:elements/cli", "element", ["ontology-atlas"], "CLI"),
      ],
      edges: [
        edge("e1", "domain:domains/views", "capability:capabilities/mcp-server"),
        edge("e2", "capability:capabilities/mcp-server", "element:elements/cli"),
      ],
    },
  }),
}));

vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => ({ agentActivityStatus: undefined }),
}));
vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => "static",
}));
vi.mock("@/entities/vault-session/ui/VaultSourceHydrationBoundary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/ui/VaultSourceHydrationBoundary")>()),
  VaultSourceHydrationBoundary: ({ children }: { children: ReactNode }) => children,
}));


vi.mock("@/widgets/app-settings-menu", () => ({
  AppSettingsMenu: () => <button type="button" data-testid="app-settings-trigger-stub" />,
}));

// Since settings moved to the nav rail's bottom slot, the page calls `useNavRailSettingsSlot`. That hook
// throws without its provider (the layout-resident contract), so it is stubbed as a no-op in page-level
// tests.
vi.mock("@/widgets/app-nav-rail", () => ({
  useNavRailSettingsSlot: () => {},
}));

function node(id: string, kind: string, projectIds: string[], title?: string) {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string, type = "contains") {
  return { id, from, to, type, projectIds: [], evidenceIds: [] };
}

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectSelectorPage />
    </NextIntlClientProvider>,
  );
}

describe("ProjectSelectorPage", () => {
  // `AppNavRail` now lives in `app/[locale]/layout.tsx` (AppShell) and this page no longer mounts it
  // directly (so the rail's DOM identity survives route changes). So this unit test asserts only the
  // settings and agent-status cluster the page still owns, not the rail itself — rail persistence is
  // verified by Playwright (rail DOM identity preserved under production static serving).
  it("설정은 남고, 실시간 표시는 여기 없다", () => {
    /*
     * "Live · N changes" is **the map's object** — that number leads to a next action only on a screen
     * that draws what changed onto the nodes. On a list screen it has nowhere to go while taking the
     * strongest ink at the top right and reserving a whole row, pushing the content below it down
     * (owner report 2026-08-03).
     */
    renderPage();
    expect(screen.getByTestId("app-settings-trigger-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("live-activity-indicator-stub")).toBeNull();
  });

  /**
   * **The whole-folder count is not tallied on this screen** (owner verdict, 2026-08-09).
   *
   * "Whole folder: N concepts · N relations" used to sit at the right of the breadcrumb row. But that is
   * **the project cards below, sliced differently** — measured on the storefront sample:
   * 49 capabilities + 54 elements + 8 domains + 1 project = **exactly 112**, the number the top was
   * stating. Only relations differed by 8 (relations outside the project).
   *
   * Counting the same thing twice under two scopes makes the reader **assume one of them is wrong**. The
   * code comment knew this and waved it away with "just add a scope label"; the owner's verdict was the
   * opposite: *"This sort of thing is confusing; the top row doesn't need information."*
   *
   * This test stops that row from quietly coming back.
   */
  it("폴더 전체 개념·관계 수를 다시 들이지 않는다 — 세는 곳은 프로젝트 카드 하나다", () => {
    renderPage();
    const main = screen.getByRole("main").textContent ?? "";
    expect(main, "이 시험이 헛돌지 않는지 — 화면이 실제로 그려졌나").toContain("project");
    expect(main).not.toContain("CONCEPTS");
    expect(main).not.toContain("RELATIONS");
    expect(screen.queryByTestId("projects-back-to-map"), "지도 입구는 레일 하나다").toBeNull();
  });

  it("renders a compact project row without graph metrics or activity", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(card).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "ontology-atlas" })).toHaveAttribute(
      "href",
      "/project/fallback/?slug=ontology-atlas",
    );
    expect(within(card).queryByText("Domains")).toBeNull();
    expect(screen.queryByTestId("project-selector-activity-row")).toBeNull();
  });

  it("links the card footer to the project detail and topology pages", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(
      within(card).getByRole("link", { name: "Open ontology-atlas details" }),
    ).toHaveAttribute("href", "/project/fallback/?slug=ontology-atlas");
    // The project's own node, not the bare slug: the bare slug opens the project drawer, which
    // cannot connect the project's code folder (2026-09-25 sweep); the node's inspector can.
    expect(within(card).getByRole("link", { name: "View on map" })).toHaveAttribute(
      "href",
      `/topology/?p=${encodeURIComponent("project:ontology-atlas")}`,
    );
  });

  it("points the new-project CTA at /project/new with a returnTo back to /projects/", () => {
    renderPage();
    expect(screen.getByTestId("project-selector-new-cta")).toHaveAttribute(
      "href",
      `/project/new/?returnTo=${encodeURIComponent("/projects/")}`,
    );
  });

  // Round four (2026-09-25): the header's "New project" and the tile's agent request were two add
  // entries with no rule between them. Both paths live in the tile now, and nowhere else.
  it("offers both ways to add a project in one tile, and only there", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    const tile = screen.getByTestId("project-selector-next-slot");
    expect(screen.getAllByTestId("project-selector-new-cta")).toHaveLength(1);
    expect(within(tile).getByTestId("project-selector-new-cta")).toBeInTheDocument();
    expect(document.querySelector("header [data-testid='project-selector-new-cta']")).toBeNull();
    within(tile).getByTestId("project-selector-next-copy").click();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(enMessages.projectPages.selector.nextSlotPrompt),
    );
  });

  // Audit finding: the English screen shipped "1 project · 1 domains". A plural at a count of 1 reads as
  // a sentence that was generated automatically.
  it("agrees in number with the count it labels", () => {
    renderPage();
    const header = screen.getByRole("main").textContent ?? "";
    // The sample is the loaded folder here (static mode), and the count says so itself.
    expect(screen.getByTestId("project-selector-count")).toHaveTextContent(/^1 sample project$/);
    expect(header).not.toContain("domain");
    expect(header).not.toContain("1 CONCEPTS");
    expect(header).not.toContain("1 RELATIONS");
    // The whole-folder count left this screen on 2026-08-09 — the test above holds that ground.
  });
});
