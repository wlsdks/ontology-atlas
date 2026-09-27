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
      // Production fills `doc.description` only from the frontmatter key.
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

// The nav rail settings slot hook throws without its layout provider.
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
  it("keeps settings but shows no live indicator here", () => {
    /* "Live · N changes" belongs to the map, where changes are drawn onto nodes. */
    renderPage();
    expect(screen.getByTestId("app-settings-trigger-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("live-activity-indicator-stub")).toBeNull();
  });

  /** The same count under two scopes makes a reader assume one is wrong. */
  it("does not repeat the folder-wide concept and relation counts; the project card is the one place that counts", () => {
    renderPage();
    const main = screen.getByRole("main").textContent ?? "";
    expect(main, "the screen did not render, so this test is vacuous").toContain("project");
    expect(main).not.toContain("CONCEPTS");
    expect(main).not.toContain("RELATIONS");
    expect(screen.queryByTestId("projects-back-to-map"), "the rail is the one way to the map").toBeNull();
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
    // The node's inspector can connect the code folder; the bare slug's drawer cannot.
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

  it("agrees in number with the count it labels", () => {
    renderPage();
    const header = screen.getByRole("main").textContent ?? "";
    expect(screen.getByTestId("project-selector-count")).toHaveTextContent(/^1 sample project$/);
    expect(header).not.toContain("domain");
    expect(header).not.toContain("1 CONCEPTS");
    expect(header).not.toContain("1 RELATIONS");
  });
});
