import { act, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

const page = vi.hoisted(() => {
  const oneProject = [
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
  ];
  return {
    mode: "static" as "static" | "local",
    vault: { agentActivityStatus: undefined } as Record<string, unknown>,
    oneProject,
    projects: oneProject as unknown[],
    selectedSlug: "ontology-atlas" as string | null,
  };
});

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
  useSelectedProjectSlug: () => page.selectedSlug,
  useProjects: () => ({
    projects: page.projects,
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
  useLocalVault: () => page.vault,
}));
vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => page.mode,
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

const pageTree = () => (
  <NextIntlClientProvider locale="en" messages={enMessages}>
    <ProjectSelectorPage />
  </NextIntlClientProvider>
);

function renderPage() {
  return render(pageTree());
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  page.mode = "static";
  page.vault = { agentActivityStatus: undefined };
  page.projects = page.oneProject;
  page.selectedSlug = "ontology-atlas";
});

describe("ProjectSelectorPage", () => {
  it("with at most one project the page is a stage", () => {
    renderPage();
    expect(document.querySelector("[data-placement]")).toHaveAttribute("data-placement", "stage");
  });

  it("while a local folder opens it shows a centred wait, not the empty tile", () => {
    page.mode = "local";
    page.vault = { agentActivityStatus: undefined, status: "opening", handle: { name: "my-notes" } };
    renderPage();
    expect(screen.getByTestId("project-selector-loading")).toHaveTextContent("my-notes");
    expect(screen.queryByTestId("project-selector-next-slot")).toBeNull();
    expect(screen.queryByTestId("project-selector-count"), "the previous folder's count stays during the switch").toBeNull();
  });

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

  it("offers both ways to add a project in one section outside the project grid, and only there", async () => {
    const writeText = stubClipboard();
    renderPage();
    expect(screen.queryByTestId("project-selector-first-stage")).toBeNull();
    const tile = screen.getByTestId("project-selector-next-slot");
    expect(screen.getByTestId("project-selector-grid")).not.toContainElement(tile);
    expect(screen.getAllByTestId("project-selector-new-cta")).toHaveLength(1);
    expect(within(tile).getByTestId("project-selector-new-cta")).toBeInTheDocument();
    expect(document.querySelector("header [data-testid='project-selector-new-cta']")).toBeNull();
    within(tile).getByTestId("project-selector-next-copy").click();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(enMessages.projectPages.selector.nextSlotPrompt),
    );
  });

  it("marks the selected project and leads the grid with it", () => {
    const ledger = { ...page.oneProject[0], slug: "ledger", name: "ledger" };
    page.projects = [...page.oneProject, ledger];
    page.selectedSlug = "ledger";
    renderPage();
    const cards = screen.getAllByTestId("project-selector-card");
    expect(cards.map((card) => card.querySelector("h2")?.textContent)).toEqual(["ledger", "ontology-atlas"]);
    expect(within(cards[0]).getByRole("link", { name: "ledger" })).toHaveAttribute("aria-current", "true");
    expect(within(cards[0]).getByTestId("project-selector-selected-tag")).toBeInTheDocument();
    expect(within(cards[1]).getByRole("link", { name: "ontology-atlas" })).not.toHaveAttribute("aria-current");
    expect(within(cards[1]).queryByTestId("project-selector-selected-tag")).toBeNull();
  });

  it("marks no project while several exist and none was opened", () => {
    page.projects = [...page.oneProject, { ...page.oneProject[0], slug: "ledger", name: "ledger" }];
    page.selectedSlug = null;
    renderPage();
    expect(screen.queryByTestId("project-selector-selected-tag")).toBeNull();
    expect(document.querySelector("[aria-current]")).toBeNull();
  });

  it("agrees in number with the count it labels", () => {
    renderPage();
    const header = screen.getByRole("main").textContent ?? "";
    expect(screen.getByTestId("project-selector-count")).toHaveTextContent(/^1 sample project$/);
    expect(header).not.toContain("domain");
    expect(header).not.toContain("1 CONCEPTS");
    expect(header).not.toContain("1 RELATIONS");
  });

  describe("with no project in the folder", () => {
    it("shows one stage with both ways in instead of the lede and the tile", async () => {
      page.projects = [];
      const writeText = stubClipboard();
      renderPage();
      const stage = screen.getByTestId("project-selector-first-stage");
      expect(within(stage).getByRole("heading", { name: enMessages.projectPages.selector.stageTitle })).toBeInTheDocument();
      expect(within(stage).getByTestId("project-selector-new-cta")).toHaveAttribute(
        "href",
        `/project/new/?returnTo=${encodeURIComponent("/projects/")}`,
      );
      expect(screen.queryByTestId("project-selector-next-slot")).toBeNull();
      expect(screen.queryByText(enMessages.projectPages.selector.lede)).toBeNull();
      expect(stage.querySelector("code")).toHaveTextContent(/^kind: project$/);

      within(stage).getByTestId("project-selector-next-copy").click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(enMessages.projectPages.selector.nextSlotPrompt));
      expect(await within(stage).findByText(enMessages.projectPages.selector.nextSlotCopied)).toBeInTheDocument();
    });

    it("lets the stage leave inert while the first project's card arrives, then removes it", async () => {
      page.mode = "local";
      page.vault = { agentActivityStatus: undefined, status: "loaded" };
      page.projects = [];
      const { rerender } = renderPage();
      expect(screen.getByTestId("project-selector-first-stage")).toBeInTheDocument();

      page.projects = page.oneProject;
      act(() => rerender(pageTree()));
      const leaving = screen.getByTestId("project-selector-first-stage").parentElement!;
      expect(leaving).toHaveAttribute("inert");
      expect(leaving).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByTestId("project-selector-card")).toBeInTheDocument();
      expect(screen.getAllByTestId("project-selector-new-cta"), "the leaving stage's link is hidden from the accessibility tree").toHaveLength(2);
      expect(screen.getByRole("link", { name: enMessages.projectPages.selector.ctaNewProject })).toBe(
        within(screen.getByTestId("project-selector-next-slot")).getByTestId("project-selector-new-cta"),
      );

      await vi.waitFor(() => expect(screen.queryByTestId("project-selector-first-stage")).toBeNull());
      expect(screen.getByTestId("project-selector-next-slot")).toBeInTheDocument();
    });
  });
});
