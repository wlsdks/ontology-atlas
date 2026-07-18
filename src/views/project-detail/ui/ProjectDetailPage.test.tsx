import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectDetailPage } from "./ProjectDetailPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/features/taxonomy", () => ({
  useTaxonomy: () => ({
    categoryLabel: (id?: string) => id ?? "—",
    statusLabel: (id?: string) => id ?? "—",
    categories: [],
    statuses: [],
  }),
}));

vi.mock("@/widgets/search-palette", () => ({
  SearchPalette: () => null,
}));
vi.mock("@/widgets/shortcut-sheet", () => ({
  ShortcutSheet: () => null,
}));
vi.mock("@/widgets/app-nav-rail", () => ({
  AppNavRail: () => null,
}));

function ontologyNode(
  id: string,
  kind: string,
  projectIds: string[] = [],
  title?: string,
) {
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

function containsEdge(from: string, to: string) {
  return {
    id: `${from}--contains-->${to}`,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

const SLUG = "ontology-atlas";

const BASE_NODES = [
  ontologyNode(`project:${SLUG}`, "project", [], "ontology-atlas"),
  ontologyNode("domain:views", "domain", [SLUG], "Views"),
  ontologyNode("capability:mcp-server", "capability", [SLUG], "MCP Server"),
  ontologyNode("element:cli", "element", [SLUG], "CLI"),
  ontologyNode("element:cli-2", "element", [SLUG], "CLI 2"),
  ontologyNode("document:readme", "document", [SLUG], "README"),
];

const BASE_EDGES = [
  containsEdge("domain:views", "capability:mcp-server"),
  containsEdge("domain:views", "element:cli"),
  containsEdge("capability:mcp-server", "element:cli-2"),
];

const mocks = vi.hoisted(() => ({
  insightNodes: [] as unknown[],
  insightEdges: [] as unknown[],
  canEdit: false,
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({
    insight: { nodes: mocks.insightNodes, edges: mocks.insightEdges },
    error: null,
  }),
}));

vi.mock("@/features/project-data-source", () => ({
  useProjects: () => ({ projects: [], loaded: true, error: null, mode: "static" }),
  useProjectMutations: () => ({
    canCreate: false,
    canEdit: mocks.canEdit,
    canDelete: false,
    mode: "static",
    updateProject: vi.fn(),
  }),
}));

function baseProject() {
  return {
    slug: SLUG,
    name: "ontology-atlas",
    description: "A local-first ontology workbench",
    tags: [],
    stack: [],
    links: [],
    dependencies: [] as string[],
    screenshots: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function renderPage(overrides: { related?: ReturnType<typeof baseProject>[] } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectDetailPage
        slug={SLUG}
        initialProject={baseProject()}
        initialRelated={overrides.related ?? []}
      />
    </NextIntlClientProvider>,
  );
}

describe("ProjectDetailPage", () => {
  it("renders the hero metric strip with real projectIds-derived counts", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // domains=1, capabilities=1, elements=2, documents=1
    expect(screen.getByText("Domains").previousElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Capabilities").previousElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Elements").previousElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Documents").previousElementSibling).toHaveTextContent("1");
  });

  it("links each domain composition card to its topology focus deep-link", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    const card = screen.getByTestId("project-detail-domain-card");
    expect(card).toHaveAttribute("href", "/topology/?mode=focus&p=domain%3Aviews");
    expect(card).toHaveTextContent("Views");
  });

  it("shows a sentence-form empty state (not a numeral) when no project is connected", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    const empty = screen.getByTestId("project-detail-connected-empty");
    expect(empty).toHaveTextContent("Not connected to any other project yet.");
    expect(empty.textContent).not.toMatch(/^0\b/);
  });

  it("omits the status segment (no stray dash) when the project has no status field", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    // baseProject() intentionally has no `status` — honest-undefined per the
    // Project entity contract (R15). heroMeta must not render a trailing
    // "Individual project · —" dash collision for the missing field.
    renderPage();

    expect(screen.getByText("Individual project")).toBeInTheDocument();
    expect(screen.queryByText(/Individual project\s*·\s*—/)).not.toBeInTheDocument();
  });

  it("renders a connected project link when dependencies point at another known project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    const related = [{ ...baseProject(), slug: "sibling", name: "Sibling Project" }];
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ProjectDetailPage
          slug={SLUG}
          initialProject={{ ...baseProject(), dependencies: ["sibling"] }}
          initialRelated={related}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Sibling Project")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-connected-empty")).not.toBeInTheDocument();
  });

  it("embeds the project slug into the agent handoff snippet", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByText((_, el) => el?.tagName === "PRE" && el.textContent!.includes(`get_concept("${SLUG}")`))).toBeInTheDocument();
  });

  it("shows the quick-edit affordance only when the data source mode allows editing (mode-aware gate preserved)", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;

    mocks.canEdit = false;
    const { unmount } = renderPage();
    expect(screen.queryByTestId("public-quick-edit-toggle")).not.toBeInTheDocument();
    unmount();

    mocks.canEdit = true;
    renderPage();
    expect(screen.getByTestId("public-quick-edit-toggle")).toBeInTheDocument();
  });

  it("hides the domain composition zone entirely when the project has no ontology domains", () => {
    mocks.insightNodes = [];
    mocks.insightEdges = [];
    mocks.canEdit = false;
    renderPage();

    expect(screen.queryByTestId("project-detail-domain-card")).not.toBeInTheDocument();
  });
});
