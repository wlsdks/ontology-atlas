import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { LocalVaultProvider } from "@/entities/vault-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectDetailPage } from "./ProjectDetailPage";

// Mocking both router and search params breaks the replace → re-render loop, so it is reconnected here.
const nav = vi.hoisted(() => ({ search: "", version: 0 }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: (href: string) => {
      nav.search = href.startsWith("?") ? href.slice(1) : "";
      nav.version += 1;
    },
  }),
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
vi.mock("@/features/construction-review-local", () => ({
  useConstructionReviewSession: () => mocks.constructionReview,
}));
// The real hook reaches the desktop bridge.
vi.mock("../lib/use-project-agent", () => ({
  useProjectAgent: () => mocks.agent,
}));
vi.mock("./parts/ProjectAgentDock", () => ({
  ProjectAgentDock: ({ open, openingRequest }: { open: boolean; openingRequest: { text: string } | null }) => (
    <div data-testid="project-agent-dock-frame" data-dock-state={open ? "open" : "empty"}>
      {openingRequest?.text}
    </div>
  ),
}));
// Only an installed-app handle carries the native `rootPath` the dock needs.
vi.mock("@/entities/vault-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/vault-session")>();
  return {
    ...actual,
    useLocalVault: () => {
      const vault = actual.useLocalVault();
      return mocks.handle ? { ...vault, handle: mocks.handle as unknown as FileSystemDirectoryHandle } : vault;
    },
  };
});
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
const PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const SOURCE_DIGEST = `sha256:${"b".repeat(64)}`;

function constructionEnvelope(overrides: {
  projectSlug?: string;
  sourceDigest?: string;
  writePlan?: unknown;
} = {}) {
  const plan = {
    concepts: [{ slug: SLUG }],
    relations: [{ from: SLUG, type: "domains", to: "shared-meaning" }],
    competencyAnswers: { scope: "answered" },
  };
  const projectSlug = overrides.projectSlug ?? SLUG;
  const sourceDigest = overrides.sourceDigest ?? SOURCE_DIGEST;
  return {
    qualification: {
      contract: "constructionQualification:v1",
      subject: { projectSlug, graphDigest: PLAN_DIGEST, sourceDigest: SOURCE_DIGEST },
      purposeAuthority: { outcome: "People and agents judge the same local meaning." },
      competencyQuestions: [], witnesses: [], cqResults: [], claims: [], citationChecks: [],
      axisResults: [], diagnostics: [],
      acceptance: { decision: "accepted", decidedBy: "jinan", authority: "human", planDigest: PLAN_DIGEST },
    },
    analysis: {
      project: { slug: projectSlug },
      proposalValidation: {
        reviewPlan: plan,
        writePlan: overrides.writePlan === undefined ? structuredClone(plan) : overrides.writePlan,
        findings: [],
        constructionLifecycle: {
          contract: "ontologyConstructionLifecycle:v1",
          qualificationStatus: "qualified",
          writeEligibility: "executable",
          planDigest: PLAN_DIGEST,
          sourceDigest,
          firstBlockingPhase: null,
          diagnostics: [],
          nextAction: "Write the exact approved rows.",
        },
      },
    },
  };
}

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
  vaultBody: null as string | null,
  projects: [] as ReturnType<typeof baseProject>[],
  projectsMode: "static" as "static" | "local",
  vaultDocs: [] as unknown[],
  vaultManifest: null as { docs: unknown[]; sources: unknown[] } | null,
  handle: null as { rootPath: string } | null,
  agent: {
    route: "unavailable",
    runtime: null,
    runtimes: [],
    runtimeId: null,
    setRuntimeId: vi.fn(),
    mcpServers: [],
    open: false,
    setOpen: vi.fn(),
    openingRequest: null,
    start: vi.fn(),
  } as Record<string, unknown>,
  constructionReview: {
    status: "idle",
    review: null,
    errorState: null,
    openPicker: vi.fn(),
    readFile: vi.fn(),
    inputProps: {},
  } as Record<string, unknown>,
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({
    insight: { nodes: mocks.insightNodes, edges: mocks.insightEdges },
    error: null,
  }),
}));

vi.mock("@/features/project-data-source", () => ({
  useProjects: () => ({
    projects: mocks.projects,
    loaded: true,
    error: null,
    mode: mocks.projectsMode,
  }),
  useProjectMutations: () => ({
    canCreate: false,
    canEdit: mocks.canEdit,
    canDelete: false,
    mode: "static",
    updateProject: vi.fn(),
    patchProject: vi.fn(),
  }),
  useProjectBody: () => ({ body: mocks.vaultBody }),
  useVaultDocs: () => mocks.vaultDocs,
  useVaultManifest: () => mocks.vaultManifest,
}));

function projectDoc(slug: string, projectSlug: string) {
  return {
    slug,
    path: `docs/ontology/${slug}.md`,
    title: projectSlug,
    tags: [],
    frontmatter: { kind: "project", slug: projectSlug },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-01-02T00:00:00.000Z",
    linksOut: [],
  };
}

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

/** The one render harness: hand-written copies missed a new provider. */
function renderPage(
  overrides: {
    related?: ReturnType<typeof baseProject>[];
    project?: Partial<React.ComponentProps<typeof ProjectDetailPage>["initialProject"]>;
  } = {},
) {
  return render(
    // The read-only line's folder door reads vault context.
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocalVaultProvider>
      <ProjectDetailPage
        slug={SLUG}
        initialProject={{ ...baseProject(), ...overrides.project }}
        initialRelated={overrides.related ?? []}
      />
      </LocalVaultProvider>
    </NextIntlClientProvider>,
  );
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    nav.search = "";
    mocks.vaultBody = null;
    mocks.projects = [];
    mocks.projectsMode = "static";
    mocks.vaultDocs = [];
    mocks.vaultManifest = null;
    mocks.handle = null;
    mocks.agent = {
      route: "unavailable",
      runtime: null,
      runtimes: [],
      runtimeId: null,
      setRuntimeId: vi.fn(),
      mcpServers: [],
      open: false,
      setOpen: vi.fn(),
      openingRequest: null,
      start: vi.fn(),
    };
    mocks.constructionReview = {
      status: "idle",
      review: null,
      errorState: null,
      openPicker: vi.fn(),
      readFile: vi.fn(),
      inputProps: {},
    };
  });

  it("clears the same slug's static initial fact once the local source settles", async () => {
    mocks.insightNodes = [];
    mocks.insightEdges = [];
    mocks.projectsMode = "local";
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("project-detail-not-found")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "ontology-atlas" }),
    ).not.toBeInTheDocument();
  });

  it("opens this project's own document and names its path when the file is known", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultDocs = [
      {
        slug: "project",
        path: "docs/ontology/project.md",
        title: "ontology-atlas",
        tags: [],
        frontmatter: { kind: "project", slug: SLUG },
        headings: [],
        excerpt: "",
        wordCount: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
        linksOut: [],
      },
    ];
    renderPage();

    const door = screen.getByTestId("project-detail-docs-vault-link");
    expect(door).toHaveAttribute("href", "/docs/?slug=project");
    expect(screen.getByTestId("project-detail-footer")).toHaveTextContent("file docs/ontology/project.md");
  });

  it("falls back to the vault root and the dated footer when no document is known", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    const door = screen.getByTestId("project-detail-docs-vault-link");
    expect(door).toHaveAttribute("href", "/docs/");
    expect(screen.getByTestId("project-detail-footer")).toHaveTextContent("Updated");
  });

  it("leads with the filled map action and draws no zero document count", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    const mapLink = screen.getByTestId("project-detail-topology-link");
    const picker = screen.getByTestId("construction-review-ingress");
    expect(mapLink.compareDocumentPosition(picker)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(mapLink.querySelector("button")?.className).toContain("--color-indigo-brand");
    expect(screen.queryByText(/Documents\s+0/)).not.toBeInTheDocument();
  });

  it("hands the overview to the agent from the page when a guarded runtime is ready", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.";
    mocks.handle = { rootPath: "/vault" };
    const start = vi.fn();
    mocks.agent = {
      route: "agent",
      runtime: { id: "claude", label: "Claude" },
      runtimes: [{ id: "claude", label: "Claude" }],
      runtimeId: "claude",
      setRuntimeId: vi.fn(),
      mcpServers: [],
      open: false,
      setOpen: vi.fn(),
      openingRequest: null,
      start,
    };
    renderPage();

    expect(screen.queryByTestId("project-detail-brief-ask-copy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("project-detail-brief-ask-open"));
    expect(start).toHaveBeenCalledTimes(1);
    const seated = start.mock.calls[0][0] as string;
    expect(seated).toContain(`get_concept("${SLUG}"`);
    expect(seated).toContain("patch_concept");
    expect(screen.getByTestId("project-agent-dock-frame")).toHaveAttribute("data-dock-state", "empty");
  });

  it("keeps the copy path and mounts no dock when no agent can be opened here", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.";
    renderPage();

    expect(screen.getByTestId("project-detail-brief-ask-copy")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-brief-ask-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-agent-dock-frame")).not.toBeInTheDocument();
  });

  it("opens one local review result below the hero without persisting it", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    const parsed = await import("@/entities/construction-review").then(({ parseConstructionReviewEnvelope }) =>
      parseConstructionReviewEnvelope(constructionEnvelope(), SLUG),
    );
    if (!parsed.ok) throw new Error(parsed.issues.join(","));
    mocks.constructionReview = {
      status: "ready",
      review: parsed.value,
      errorState: null,
      openPicker: vi.fn(),
      readFile: vi.fn(),
      inputProps: {},
    };
    renderPage();

    expect(screen.getByTestId("construction-review-ingress")).toBeInTheDocument();
    const summary = screen.getByTestId("construction-review-summary");
    expect(summary).toHaveAttribute("data-qualification-status", "qualified");
    expect(summary.compareDocumentPosition(screen.getByTestId("project-detail-composition"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(localStorage).toHaveLength(0);
  });

  it.each(["malformed", "project_mismatch", "digest_mismatch", "plan_mismatch"])(
  "fails closed for %s review input", async (state) => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.constructionReview = {
      status: "blocked",
      review: null,
      errorState: state,
      openPicker: vi.fn(),
      readFile: vi.fn(),
      inputProps: {},
    };
    renderPage();

    const error = screen.getByTestId("construction-review-error");
    expect(error).toHaveAttribute("data-envelope-state", state);
    expect(screen.queryByTestId("construction-review-summary")).not.toBeInTheDocument();
  });

  it("the ontology cell carries this project's own projectIds-derived counts", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // A description list, since the row is reversed visually to read "1 Domains" on screen.
    const cell = screen.getByTestId("project-detail-surface-board").querySelector('[data-surface="ontology"]')!;
    const figures = [...cell.querySelectorAll("dt")].map((term) => [
      term.textContent,
      term.parentElement?.querySelector("dd")?.textContent,
    ]);
    expect(figures).toEqual([
      ["Domains", "1"],
      ["Capabilities", "1"],
      ["Elements", "2"],
    ]);
  });

  it("names the three Atlas surfaces, and the map has one door on the page", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    const cells = screen.getAllByTestId("project-detail-surface-cell");
    expect(cells.map((cell) => cell.getAttribute("data-surface"))).toEqual(["ontology", "library", "harness"]);
    const doors = screen.getAllByTestId("project-detail-surface-open");
    expect(doors.map((door) => door.getAttribute("href"))).toEqual(["/library/", "/architecture/"]);
    const mapDoors = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === `/topology/?p=${encodeURIComponent(`project:${SLUG}`)}`);
    expect(mapDoors).toHaveLength(1);
  });

  it("opens the map on the project's own node, where its code folder is connected", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    expect(screen.getByTestId("project-detail-topology-link")).toHaveAttribute(
      "href",
      `/topology/?p=${encodeURIComponent(`project:${SLUG}`)}`,
    );
  });

  it("keeps the project name the page's level-1 heading when it is editable", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = true;
    renderPage();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAccessibleName("ontology-atlas");
    expect(within(heading).getByRole("button", { name: "ontology-atlas" })).toBeInTheDocument();
  });

  it("counts the sample's sources in the library cell without an open folder", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.projectsMode = "static";
    mocks.handle = null;
    mocks.vaultManifest = { docs: [], sources: [{ path: "sources/a.md" }, { path: "sources/b.md" }] };
    renderPage();

    const library = screen.getByTestId("project-detail-surface-board").querySelector('[data-surface="library"]')!;
    const figures = [...library.querySelectorAll("dt")].map((node, index) => [
      node.textContent,
      library.querySelectorAll("dd")[index]?.textContent,
    ]);
    expect(figures).toContainEqual(["sources", "2"]);
  });

  it("the harness cell shows no figure, because this surface cannot count from here", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    const harness = screen.getByTestId("project-detail-surface-board").querySelector('[data-surface="harness"]')!;
    expect(harness.querySelector("dl")).toBeNull();
    expect(harness).toHaveTextContent(/instructions, structure and sensors/i);
  });

  it("shows the relation count as a line in the ontology cell, not a fourth metric", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    const cell = screen.getByTestId("project-detail-surface-board").querySelector('[data-surface="ontology"]')!;
    const figureLabels = [...cell.querySelectorAll("dt")].map((node) => node.textContent);
    expect(figureLabels).toEqual(["Domains", "Capabilities", "Elements"]);
    // It names its scope: only edges with both ends in this project.
    expect(cell.querySelector('[data-testid="project-detail-surface-note"]')).toHaveTextContent(
      "3 relations among these concepts",
    );
  });

  /* The raw node array also counts the vault readme. */
  it("counts folder-wide concepts by the same rule as the map INDEX", () => {
    mocks.insightNodes = [
      ...BASE_NODES,
      ontologyNode("vault-readme:README", "vault-readme", [], "My ontology vault"),
    ];
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByTestId("project-detail-global-census")).toHaveTextContent(
      "6 concepts in the whole folder",
    );
    expect(screen.getByTestId("project-detail-global-census")).not.toHaveTextContent(/relation/i);
  });

  it("captions the composition board with its scope, since only the ontology belongs to this project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByTestId("project-detail-composition")).toHaveTextContent(
      "Sources and wiki pages count the whole folder",
    );
  });

  it("reveals the domain map deep link when a domain row expands", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    nav.search = "tab=composition";
    renderPage();

    const row = screen.getByTestId("project-detail-domain-row-toggle");
    expect(row).toHaveTextContent("Views");
    fireEvent.click(row);
    expect(screen.getByTestId("project-detail-domain-map-link")).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=domain%3Aviews",
    );
  });

  it("draws no radial domain map in the hero; the domain list lives only in the domain rows", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    const { container } = renderPage();
    const header = container.querySelector("header")!;

    /* An absence check passes forever on a wrong selector, so the selector is probed first. */
    const probe = document.createElement("div");
    probe.innerHTML = '<svg role="img" aria-label="probe"></svg>';
    header.appendChild(probe);
    expect(header.querySelector("svg[role='img']")).not.toBeNull();
    probe.remove();

    expect(header.querySelector("svg[role='img']")).toBeNull();
    expect(header.querySelector("[data-testid='domain-capacity-bar-row']")).toBeNull();
  });

  it("shows the overlap footnote once, beside the list", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getAllByTestId("project-detail-domain-overlap-note")).toHaveLength(1);
  });

  it("draws the composition and the domains on one page, with no tablist", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-detail-surface-board")).toBeInTheDocument();
    expect(screen.getByTestId("project-detail-domain-rows")).toBeInTheDocument();
    expect(screen.getByTestId("project-detail-connected")).toBeInTheDocument();
  });

  it("shows a sentence-form empty state (not a numeral) when no project is connected", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    // The card is only drawn when the folder holds another project.
    mocks.vaultDocs = [projectDoc("project", SLUG), projectDoc("second", "second")];
    renderPage();

    const empty = screen.getByTestId("project-detail-connected-empty");
    expect(empty).toHaveTextContent("Not connected to any other project yet.");
    expect(empty.textContent).not.toMatch(/^0\b/);
  });

  it("skips the connection card when the folder has one project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultDocs = [projectDoc("project", SLUG)];
    renderPage();

    expect(screen.queryByTestId("project-detail-connected-card")).toBeNull();
    expect(screen.getByTestId("project-detail-connected")).toBeInTheDocument();
  });

  it("omits the status segment (no stray dash) when the project has no status field", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    // baseProject() has no `status`, so no trailing "· —".
    renderPage();

    expect(screen.getByText("Individual project")).toBeInTheDocument();
    expect(screen.queryByText(/Individual project\s*·\s*—/)).not.toBeInTheDocument();
  });

  it("renders a connected project link when dependencies point at another known project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    const related = [{ ...baseProject(), slug: "sibling", name: "Sibling Project" }];
    renderPage({ project: { dependencies: ["sibling"] }, related });

    expect(screen.getByText("Sibling Project")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-connected-empty")).not.toBeInTheDocument();
    // No decorative arrow on an in-app link.
    expect(screen.getByTestId("project-detail-connected").textContent).not.toContain("↗");
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

  it("explains the read-only state instead of just omitting the edit entry point", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;

    mocks.canEdit = false;
    const { unmount } = renderPage();
    expect(screen.getByTestId("project-detail-readonly-badge")).toBeInTheDocument();
    unmount();

    mocks.canEdit = true;
    renderPage();
    expect(screen.queryByTestId("project-detail-readonly-badge")).not.toBeInTheDocument();
  });

  it("hides the domain composition zone entirely when the project has no ontology domains", () => {
    mocks.insightNodes = [];
    mocks.insightEdges = [];
    mocks.canEdit = false;
    renderPage();

    expect(screen.queryByTestId("project-detail-domain-rows")).not.toBeInTheDocument();
  });

  it("shows the empty-body hint when neither project.detail nor the vault body is available (pre-fix behavior preserved)", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultBody = null;
    renderPage();

    expect(screen.getByTestId("project-detail-body-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-body-content")).not.toBeInTheDocument();
  });

  it("renders the real project.md body as a fallback when project.detail (the frontmatter field) is unset — the bug this fix closes", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultBody = "## Real project.md content\n\nThis is the actual markdown body.";
    renderPage();

    const content = screen.getByTestId("project-detail-brief-summary");
    expect(content).toHaveTextContent("Real project.md content");
    expect(content).toHaveTextContent("This is the actual markdown body.");
    expect(screen.queryByTestId("project-detail-body-empty")).not.toBeInTheDocument();
  });

  it("draws a sectioned body as a brief: numbered blocks, a step strip, rows, and document doors", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = [
      "## What it does",
      "A store.",
      "",
      "## How work flows",
      "1. **Browse.** The [[domains/catalog|catalog]] first.",
      "2. **Buy.** Orders and payment.",
      "",
      "## Where it is uneven",
      "- Loyalty is mostly a plan.",
      "- Inventory is dense.",
    ].join("\n");
    renderPage();

    const brief = screen.getByTestId("project-detail-brief-summary");
    expect(brief).toHaveAttribute("data-section-count", "3");
    const sections = screen.getByTestId("project-detail-brief-sections");
    expect([...sections.querySelectorAll("li")].map((item) => item.textContent?.replace(/^·\s*/, ""))).toEqual([
      "What it does",
      "How work flows",
      "Where it is uneven",
    ]);
    expect(screen.queryByTestId("project-detail-brief-steps")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-detail-body-content")).toHaveTextContent("A store.");
    expect(screen.getByTestId("project-detail-body-continue")).toBeInTheDocument();
    expect(screen.getByTestId("project-detail-brief-ask")).toHaveAttribute("data-brief-state", "structured");
  });

  it("shows the first block of a body that starts with a list", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "- A storefront that sells one thing\n- Built in the open";
    renderPage();

    expect(screen.getByTestId("project-detail-body-content")).toHaveTextContent(
      "A storefront that sells one thing",
    );
  });

  it("keeps an unsectioned body as prose and leads with the ask to lay it out", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.\n\nAnother paragraph.";
    mocks.vaultDocs = [
      {
        slug: "project",
        path: "docs/ontology/project.md",
        title: "ontology-atlas",
        tags: [],
        frontmatter: { kind: "project", slug: SLUG },
        headings: [],
        excerpt: "",
        wordCount: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
        linksOut: [],
      },
    ];
    renderPage();

    expect(screen.getByTestId("project-detail-body-content")).toHaveTextContent("One paragraph.");
    expect(screen.queryByTestId("project-detail-brief-sections")).not.toBeInTheDocument();
    const ask = screen.getByTestId("project-detail-brief-ask");
    expect(ask).toHaveAttribute("data-brief-state", "unstructured");
    const copy = screen.getByTestId("project-detail-brief-ask-copy");
    expect(copy.className).toContain("--color-indigo-brand");
    const preview = ask.querySelector("pre")?.textContent ?? "";
    expect(preview).toContain(`get_concept("${SLUG}"`);
    expect(preview).toContain("docs/ontology/project.md");
    expect(preview).toContain("expected_mtime");
    expect(preview).toContain("patch_concept");
  });

  it("prefers the explicit frontmatter detail field over the vault body fallback when both exist", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultBody = "Vault body text that should be shadowed.";
    renderPage({ project: { detail: "Explicit detail field wins." } });

    const content = screen.getByTestId("project-detail-body-content");
    expect(content).toHaveTextContent("Explicit detail field wins.");
    expect(content).not.toHaveTextContent("Vault body text that should be shadowed.");
  });
});
