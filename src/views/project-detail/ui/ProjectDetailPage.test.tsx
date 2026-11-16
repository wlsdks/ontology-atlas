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
  evidence: {
    availability: "app-only" as "measured" | "reading" | "app-only" | "unreadable" | "no-paths",
    states: new Map<string, "current" | "stale" | "unknown">(),
    movedPaths: new Map<string, string>(),
    stalePaths: new Map<string, { path: string; gone: boolean; changedAt: string | null }>(),
  },
  recent: { reading: false, windowDays: 7, rows: [] as { id: string; agoDays: number }[], recentNodeIds: new Set<string>() },
  conceptFacts: new Map<string, { findings: string[] }>(),
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
  useMapEvidenceStates: () => mocks.evidence,
  useAdaptiveRecentChanges: () => mocks.recent,
  useVaultConceptFacts: () => mocks.conceptFacts,
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
  const project = { ...baseProject(), ...overrides.project };
  // The static source lists the project too, or the page settles to not-found after a press.
  if (mocks.projectsMode === "static" && mocks.projects.length === 0) {
    mocks.projects = [project as ReturnType<typeof baseProject>, ...(overrides.related ?? [])];
  }
  return render(
    // The read-only line's folder door reads vault context.
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocalVaultProvider>
      <ProjectDetailPage
        slug={SLUG}
        initialProject={project}
        initialRelated={overrides.related ?? []}
      />
      </LocalVaultProvider>
    </NextIntlClientProvider>,
  );
}

function openMoreMenu() {
  fireEvent.click(screen.getByTestId("project-detail-more"));
  return screen.getByTestId("project-detail-more-menu");
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    nav.search = "";
    mocks.evidence = { availability: "app-only", states: new Map(), movedPaths: new Map(), stalePaths: new Map() };
    mocks.recent = { reading: false, windowDays: 7, rows: [], recentNodeIds: new Set() };
    mocks.conceptFacts = new Map();
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

  it("opens this project's own document from the menu and names its path when the file is known", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultDocs = [projectDoc("project", SLUG)];
    mocks.vaultBody = "One paragraph.";
    renderPage();

    expect(screen.getByTestId("project-detail-body-continue")).toHaveAttribute("href", "/docs/?slug=project");
    openMoreMenu();
    expect(screen.getByTestId("project-detail-docs-vault-link")).toHaveAttribute("href", "/docs/?slug=project");
    expect(screen.getByTestId("project-detail-footer")).toHaveTextContent("file docs/ontology/project.md");
  });

  it("falls back to the vault root and the dated footer when no document is known", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    openMoreMenu();
    expect(screen.getByTestId("project-detail-docs-vault-link")).toHaveAttribute("href", "/docs/");
    expect(screen.getByTestId("project-detail-footer")).toHaveTextContent("Updated");
  });

  it("leads with one filled map action, then the hand-off copy, and keeps the rest in one menu", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = true;
    renderPage();

    const mapLink = screen.getByTestId("project-detail-topology-link");
    const handoff = screen.getByTestId("project-detail-handoff-copy");
    expect(mapLink.compareDocumentPosition(handoff)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(mapLink.className).toContain("--color-indigo-brand");
    expect(handoff.className).not.toContain("--color-indigo-brand");

    const menu = openMoreMenu();
    expect(within(menu).getAllByRole("menuitem").map((item) => item.getAttribute("data-testid"))).toEqual([
      "project-detail-copy-link",
      "project-detail-docs-vault-link",
      "project-detail-quick-edit",
      "construction-review-open",
      "project-detail-brief-ask",
      "project-detail-new-project",
    ]);
    expect(screen.getByTestId("project-detail-new-project").getAttribute("href")).toMatch(/^\/project\/new\//);
  });

  it("hands the overview to the agent from the page when a guarded runtime is ready", async () => {
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

    openMoreMenu();
    fireEvent.click(screen.getByTestId("project-detail-brief-ask"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByTestId("project-detail-brief-ask-copy")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId("project-detail-brief-ask-open"));
    expect(start).toHaveBeenCalledTimes(1);
    const seated = start.mock.calls[0][0] as string;
    expect(seated).toContain(`get_concept("${SLUG}"`);
    expect(seated).toContain("patch_concept");
    expect(screen.getByTestId("project-agent-dock-frame")).toHaveAttribute("data-dock-state", "empty");
  });

  it("keeps the copy path and mounts no dock when no agent can be opened here", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.";
    renderPage();

    openMoreMenu();
    fireEvent.click(screen.getByTestId("project-detail-brief-ask"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("project-detail-brief-ask-copy")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("project-detail-brief-ask-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-agent-dock-frame")).not.toBeInTheDocument();
  });

  it("opens one local review result between the identity and the composition without persisting it", async () => {
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
    expect(screen.getByTestId("project-detail-identity").compareDocumentPosition(summary)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
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

  it("says this project's own counts in words on the composition heading line", () => {
    mocks.insightNodes = [...BASE_NODES, ontologyNode("domain:elsewhere", "domain", ["other"], "Elsewhere")];
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByTestId("project-detail-composition-counts")).toHaveTextContent(
      "1 domain · 1 capability · 2 elements · 3 relations",
    );
    expect(screen.queryByTestId("project-detail-surface-board")).not.toBeInTheDocument();
  });

  it("has one door to the project's own node on the map", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    renderPage();

    const href = `/topology/?p=${encodeURIComponent(`project:${SLUG}`)}`;
    expect(screen.getByTestId("project-detail-topology-link")).toHaveAttribute("href", href);
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === href)).toHaveLength(1);
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

  it("counts the folder's sources in one closing line and draws nothing when the folder has none", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    const { unmount } = renderPage();
    expect(screen.queryByTestId("project-detail-library-line")).not.toBeInTheDocument();
    unmount();

    mocks.vaultManifest = { docs: [], sources: [{ path: "sources/a.md" }, { path: "sources/b.md" }] };
    renderPage();
    const line = screen.getByTestId("project-detail-library-line");
    expect(line).toHaveTextContent("2 sources · 0 wiki pages");
    expect(within(line).getByRole("link")).toHaveAttribute("href", "/library/");
  });

  it("links the Harness only when the desktop app can read the folder", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    const { unmount } = renderPage();
    expect(screen.queryByTestId("project-detail-harness-link")).not.toBeInTheDocument();
    unmount();

    mocks.handle = { rootPath: "/vault" };
    renderPage();
    expect(screen.getByTestId("project-detail-harness-link")).toHaveAttribute("href", "/architecture/");
  });

  it("says the library counts are the folder's when the folder holds more than one project", () => {
    mocks.insightNodes = [...BASE_NODES, ontologyNode("project:other", "project", [], "Other")];
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultManifest = { docs: [], sources: [{ path: "sources/a.md" }] };
    renderPage();

    expect(screen.getByTestId("project-detail-library-line")).toHaveTextContent(
      "Sources and wiki pages count the whole folder",
    );
  });

  it("drops the folder scope caption and project-type label when the folder holds one project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultManifest = { docs: [], sources: [{ path: "sources/a.md" }] };
    renderPage();

    expect(document.body).not.toHaveTextContent("Sources and wiki pages count the whole folder");
    expect(document.body).not.toHaveTextContent("Individual project");
  });

  it("selects the first domain on arrival and moves the selection with the arrow keys, Home and End", () => {
    mocks.insightNodes = [
      ...BASE_NODES,
      ontologyNode("domain:storage", "domain", [SLUG], "Storage"),
      ontologyNode("capability:sync", "capability", [SLUG], "Sync"),
    ];
    mocks.insightEdges = [...BASE_EDGES, containsEdge("domain:storage", "capability:sync")];
    renderPage();

    const list = screen.getByRole("listbox");
    expect(list.querySelector("[aria-expanded]")).toBeNull();
    const selected = () => screen.getAllByRole("option").filter((option) => option.getAttribute("aria-selected") === "true");
    const detailTitle = () => screen.getByTestId("project-detail-domain-detail-title").textContent;
    expect(selected()).toHaveLength(1);
    expect(detailTitle()).toBe("Views");
    expect(screen.getByTestId("project-detail-domain-map-link")).toHaveAttribute("href", "/topology/?mode=focus&p=domain%3Aviews");

    fireEvent.keyDown(selected()[0], { key: "ArrowDown" });
    expect(selected()).toHaveLength(1);
    expect(detailTitle()).toBe("Storage");
    expect(document.activeElement).toBe(selected()[0]);
    fireEvent.keyDown(selected()[0], { key: "Home" });
    expect(detailTitle()).toBe("Views");
    fireEvent.keyDown(selected()[0], { key: "End" });
    expect(detailTitle()).toBe("Storage");
    fireEvent.keyDown(selected()[0], { key: "ArrowUp" });
    expect(detailTitle()).toBe("Views");
  });

  it("shows twelve capabilities of the selected domain, then the rest behind one press", () => {
    const capabilities = Array.from({ length: 14 }, (_, index) =>
      ontologyNode(`capability:c${index}`, "capability", [SLUG], `Capability ${String(index).padStart(2, "0")}`),
    );
    mocks.insightNodes = [ontologyNode("domain:views", "domain", [SLUG], "Views"), ...capabilities];
    mocks.insightEdges = capabilities.map((capability) => containsEdge("domain:views", capability.id));
    renderPage();

    expect(screen.getAllByTestId("project-detail-capability-link")).toHaveLength(12);
    fireEvent.click(screen.getByTestId("project-detail-domain-show-more"));
    expect(screen.getAllByTestId("project-detail-capability-link")).toHaveLength(14);
  });

  it("draws no domain bar and no radial map in the identity", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();
    const identity = screen.getByTestId("project-detail-identity");

    /* An absence check passes forever on a wrong selector, so the selector is probed first. */
    const probe = document.createElement("div");
    probe.innerHTML = '<svg role="img" aria-label="probe"></svg>';
    identity.appendChild(probe);
    expect(identity.querySelector("svg[role='img']")).not.toBeNull();
    probe.remove();

    expect(identity.querySelector("svg[role='img']")).toBeNull();
    expect(within(identity).queryByTestId("project-detail-domain-bar")).toBeNull();
  });

  it("explains once that nested domains count a concept twice", () => {
    mocks.insightNodes = [...BASE_NODES, ontologyNode("domain:outer", "domain", [SLUG], "Outer")];
    mocks.insightEdges = [containsEdge("domain:outer", "domain:views"), ...BASE_EDGES];
    renderPage();

    expect(screen.getAllByTestId("project-detail-domain-overlap-note")).toHaveLength(1);
  });

  it("unfolds nothing in place: no tablist, no details, and the hand-off preview is a dialog", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.";
    const { container } = renderPage();

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("[aria-expanded='true']")).toBeNull();
    fireEvent.click(screen.getByTestId("project-detail-handoff-preview"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText((_, el) => el?.tagName === "PRE" && el.textContent!.includes(`get_concept("${SLUG}")`)),
    ).toBeInTheDocument();
  });

  it("draws no connection line when nothing connects, even in a folder of several projects", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultDocs = [projectDoc("project", SLUG), projectDoc("second", "second")];
    renderPage();

    expect(screen.queryByTestId("project-detail-connected")).not.toBeInTheDocument();
  });

  it("omits the status segment (no stray dash) when the project has no status field", () => {
    mocks.insightNodes = [...BASE_NODES, ontologyNode("project:other", "project", [], "Other")];
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByText(/^Individual project · Updated/)).toBeInTheDocument();
    expect(screen.queryByText(/Individual project\s*·\s*—/)).not.toBeInTheDocument();
  });

  it("names a connected project in the closing line when dependencies point at another known project", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    const related = [{ ...baseProject(), slug: "sibling", name: "Sibling Project" }];
    renderPage({ project: { dependencies: ["sibling"] }, related });

    const line = screen.getByTestId("project-detail-connected");
    expect(within(line).getByRole("link", { name: "Sibling Project" })).toBeInTheDocument();
    // No decorative arrow on an in-app link.
    expect(line.textContent).not.toContain("↗");
  });

  it("offers quick edit in the menu only when the data source mode allows editing", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;

    mocks.canEdit = false;
    const { unmount } = renderPage();
    openMoreMenu();
    expect(screen.queryByTestId("project-detail-quick-edit")).not.toBeInTheDocument();
    unmount();

    mocks.canEdit = true;
    renderPage();
    openMoreMenu();
    fireEvent.click(screen.getByTestId("project-detail-quick-edit"));
    expect(await screen.findByTestId("public-quick-edit-surface")).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByTestId("public-quick-edit-toggle"));
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

  it("says in one line that the project has no domains yet", () => {
    mocks.insightNodes = [];
    mocks.insightEdges = [];
    mocks.canEdit = false;
    renderPage();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-detail-composition-empty")).toHaveTextContent("No domains yet");
  });

  it("shows the empty-body hint when neither project.detail nor the vault body is available", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultBody = null;
    renderPage();

    expect(screen.getByTestId("project-detail-body-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-lead")).not.toBeInTheDocument();
  });

  it("reads the lead paragraph from the project file when the frontmatter has no detail field", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultBody = "## Real project.md content\n\nThis is the actual markdown body.";
    renderPage();

    expect(screen.getByTestId("project-detail-lead")).toHaveTextContent("This is the actual markdown body.");
    expect(screen.queryByTestId("project-detail-body-empty")).not.toBeInTheDocument();
  });

  it("leads a sectioned body with its first paragraph and lists none of its headings", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = [
      "## What it does",
      "A store.",
      "",
      "## How work flows",
      "1. **Browse.** The [[domains/catalog|catalog]] first.",
      "",
      "## Where it is uneven",
      "- Loyalty is mostly a plan.",
    ].join("\n");
    renderPage();

    const lead = screen.getByTestId("project-detail-lead");
    expect(lead).toHaveTextContent(/^A store\.$/);
    expect(document.body).not.toHaveTextContent("How work flows");
    expect(screen.getByTestId("project-detail-body-continue")).toBeInTheDocument();
  });

  it("starts the lead after the sentence the description already says", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "A local-first ontology workbench for one codebase. It keeps meaning in Markdown.";
    renderPage({ project: { description: "A local-first ontology workbench for one codebase." } });

    expect(screen.getByTestId("project-detail-lead")).toHaveTextContent(/^It keeps meaning in Markdown\.$/);
  });

  it("shows the first block of a body that starts with a list", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "- A storefront that sells one thing\n- Built in the open";
    renderPage();

    expect(screen.getByTestId("project-detail-lead")).toHaveTextContent("A storefront that sells one thing");
  });

  it("renders hostile Markdown in the lead as text, without an image, script or script link", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody =
      "Lead <img src=x onerror=alert(1)> [x](javascript:alert(1)) ![p](https://attacker.example/p.png) end.";
    renderPage();

    const lead = screen.getByTestId("project-detail-lead");
    expect(lead.querySelector("img, script")).toBeNull();
    expect(lead.querySelectorAll("a[href^='javascript:' i]")).toHaveLength(0);
    expect(lead).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("asks to lay out an unsectioned body, with the prompt shown before it is copied", async () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.vaultBody = "One paragraph.\n\nAnother paragraph.";
    mocks.vaultDocs = [projectDoc("project", SLUG)];
    renderPage();

    expect(screen.getByTestId("project-detail-lead")).toHaveTextContent("One paragraph.");
    openMoreMenu();
    fireEvent.click(screen.getByTestId("project-detail-brief-ask"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This overview is not laid out yet");
    const preview = dialog.querySelector("pre")?.textContent ?? "";
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

    const lead = screen.getByTestId("project-detail-lead");
    expect(lead).toHaveTextContent("Explicit detail field wins.");
    expect(lead).not.toHaveTextContent("Vault body text that should be shadowed.");
  });

  describe("beside the brief: what to check and what changed", () => {
    const withDoc = (id: string, kind: string, title: string, docSlug: string) => ({ ...ontologyNode(id, kind, [SLUG], title), evidenceIds: [docSlug] });

    it("lists a stale capability with the file that moved, opens it on the map, and marks it in the composition", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "measured",
        states: new Map([["capability:mcp-server", "stale"]]),
        movedPaths: new Map([["capability:mcp-server", "mcp/src/server.mjs"]]),
        stalePaths: new Map([["capability:mcp-server", { path: "mcp/src/server.mjs", gone: false, changedAt: "2026-11-16T00:00:00Z" }]]),
      };
      renderPage();

      const row = screen.getByTestId("project-detail-to-check-row");
      expect(row).toHaveAttribute("data-reason", "stale");
      expect(row).toHaveTextContent("mcp/src/server.mjs changed after this document was written.");
      expect(row).toHaveAttribute("href", "/topology/?mode=focus&p=capability%3Amcp-server");
      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent("1 of 1 capability that name a source file");
      const staleWords = enMessages.projectPages.detail.compositionStaleLegend;
      expect(screen.getByRole("img", { name: staleWords })).toHaveAttribute("title", staleWords);
      expect(screen.getByTestId("project-detail-stale-legend")).toHaveTextContent(`◐${staleWords}`);
      expect(screen.getByTestId("project-detail-domain-stale")).toHaveTextContent("◐ 1");
    });

    it("draws no stale mark when evidence was not measured, names why, and says the empty sentence beside it", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "unreadable",
        states: new Map([["capability:mcp-server", "stale"]]),
        movedPaths: new Map(),
        stalePaths: new Map([["capability:mcp-server", { path: "mcp/src/server.mjs", gone: false, changedAt: null }]]),
      };
      renderPage();

      expect(screen.queryByTestId("project-detail-to-check-row")).not.toBeInTheDocument();
      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent(enMessages.projectPages.detail.toCheckEvidenceUnreadable);
      expect(screen.getByTestId("project-detail-to-check-empty")).toHaveTextContent(enMessages.projectPages.detail.toCheckEmpty);
      expect(screen.queryByTestId("project-detail-capability-stale")).not.toBeInTheDocument();
      expect(screen.queryByTestId("project-detail-stale-legend")).not.toBeInTheDocument();
      expect(screen.queryByTestId("project-detail-domain-stale")).not.toBeInTheDocument();
    });

    it("says no capability names a file when the walk compared none of this project's, even though it measured others", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "measured",
        states: new Map([["capability:another-project", "current"]]),
        movedPaths: new Map(),
        stalePaths: new Map(),
      };
      renderPage();

      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent(enMessages.projectPages.detail.toCheckEvidenceNoPaths);
      expect(screen.queryByTestId("project-detail-stale-legend")).not.toBeInTheDocument();
    });

    it("opens every row in a dialog grouped by reason when more rows exist than fit", () => {
      const names = ["Alpha", "Beta", "Gamma", "Delta"];
      mocks.insightNodes = [...BASE_NODES, ...names.map((name) => withDoc(`capability:${name}`, "capability", name, `capabilities/${name}`))];
      mocks.insightEdges = BASE_EDGES;
      mocks.conceptFacts = new Map(names.map((name) => [`capabilities/${name}`, { findings: ["definition-missing"] }]));
      renderPage();

      expect(screen.getAllByTestId("project-detail-to-check-row")).toHaveLength(3);
      fireEvent.click(screen.getByTestId("project-detail-to-check-view-all"));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("No definition · 4")).toBeInTheDocument();
      expect(within(dialog).getAllByTestId("project-detail-to-check-row")).toHaveLength(4);
    });

    it("opens a document the agent raised in /docs, with the agent's note as its reason", async () => {
      mocks.insightNodes = [...BASE_NODES, withDoc("capability:checkout", "capability", "Checkout", "capabilities/checkout")];
      mocks.insightEdges = BASE_EDGES;
      mocks.vaultDocs = [
        { slug: "capabilities/checkout", title: "Checkout", frontmatter: { kind: "capability", review_state: "human_decides", review_note: "One capability or two?" } },
      ];
      renderPage();

      const row = await screen.findByTestId("project-detail-to-check-row");
      expect(row).toHaveAttribute("data-reason", "raised");
      expect(row).toHaveTextContent("One capability or two?");
      expect(row.getAttribute("href")).toContain("slug=capabilities%2Fcheckout");
    });

    it("lists this project's changes newest first, with the map's recent lens as its door", () => {
      mocks.insightNodes = [...BASE_NODES, ontologyNode("capability:other", "capability", ["other"], "Other")];
      mocks.insightEdges = BASE_EDGES;
      mocks.recent = {
        reading: false,
        windowDays: 7,
        rows: [
          { id: "capability:other", agoDays: 0 },
          { id: "element:cli", agoDays: 1 },
          { id: "capability:mcp-server", agoDays: 0 },
        ],
        recentNodeIds: new Set(["capability:other", "element:cli", "capability:mcp-server"]),
      };
      renderPage();

      expect(screen.getByTestId("project-detail-changed-heading")).toHaveTextContent("Changed in the last 7 days · 2");
      const rows = screen.getAllByTestId("project-detail-changed-row");
      expect(rows.map((row) => row.textContent)).toEqual(["MCP Servertoday", "CLIyesterday"]);
      expect(screen.getByTestId("project-detail-changed-map-link")).toHaveAttribute("href", "/topology/?recent=auto");
      expect(screen.getByTestId("project-detail-capability-changed")).toHaveAccessibleName(enMessages.topology.index.freshTitle);
    });

    it("says it is reading change dates instead of claiming nothing changed", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.recent = { reading: true, windowDays: 7, rows: [], recentNodeIds: new Set() };
      renderPage();

      expect(screen.getByTestId("project-detail-changed-heading")).toHaveTextContent(enMessages.projectPages.detail.changedReading);
      expect(screen.queryByTestId("project-detail-changed-empty")).not.toBeInTheDocument();
    });

    it("opens Changes from the closing line", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      renderPage();
      expect(screen.getByTestId("project-detail-changes-link")).toHaveAttribute("href", "/changes/");
    });
  });
});
