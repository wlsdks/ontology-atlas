import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { LocalVaultProvider } from "@/entities/vault-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectDetailPage } from "./ProjectDetailPage";

// The tab state **lives in the URL** so it can be shared and reproduced by an agent. In the real app
// `router.replace` triggers a re-render and `useSearchParams` yields the new value. Mocking both breaks
// that loop, so it is reconnected here.
const nav = vi.hoisted(() => ({ search: "", version: 0 }));

vi.mock("next/navigation", () => ({
  // Reading `version` produces a new instance on the re-render after a replace.
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
vi.mock("@/widgets/shortcut-sheet", () => ({
  ShortcutSheet: () => null,
}));
vi.mock("@/features/construction-review-local", () => ({
  useConstructionReviewSession: () => mocks.constructionReview,
}));
// The agent hook reaches the desktop bridge; the page is tested against the two routes it draws.
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
// The dock needs a native folder path, which only an installed-app handle carries (`rootPath`).
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

/**
 * There is **one** render harness. The same tree used to be written out twice more by hand, and when a
 * provider had to be added those two were missed — wherever there is a copy is where things drift.
 */
function renderPage(
  overrides: {
    related?: ReturnType<typeof baseProject>[];
    project?: Partial<React.ComponentProps<typeof ProjectDetailPage>["initialProject"]>;
  } = {},
) {
  return render(
    // This screen puts the folder-opening path beside the "read only" badge, and that component reads
    // vault context, so the provider is required (the 2026-08-07 dead-CTA fix).
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
    // The tab is URL state, so it is reset between tests to stop it leaking.
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

  it("local source가 확정되면 같은 slug의 static initial fact를 지운다", async () => {
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
    // The dock is mounted beside the page only on this route.
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

    // domains=1, capabilities=1, elements=2. Read as a description list pairs them — the term and
    // the description it belongs to — rather than as running text, whose order is a drawing
    // decision: the row is reversed visually so the figure reads "1 Domains" on screen while the
    // document names the term first, which is the order a description list requires.
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
    // The ontology cell's door would be the map, which the hero's primary action already opens.
    const mapDoors = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === `/topology/?p=${SLUG}`);
    expect(mapDoors).toHaveLength(1);
  });

  // The Library cell once counted wiki pages out of the chosen sample while counting sources out
  // of the open local folder, so every reader without a folder open — the web, and any sample —
  // was told the folder held no sources whatever it held. One manifest answers both now.
  it("자료실 칸은 폴더를 열지 않아도 그 표본의 원본 수를 센다", () => {
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

  // Relations say how connected the map is, not how much of it there is, so they are a different
  // kind from the containment figures and ride the cell's note line instead of becoming a fourth
  // figure of equal weight. Pinned so that hierarchy inside the cell cannot collapse.
  it("관계 수는 네 번째 지표가 아니라 온톨로지 칸의 한 줄로 붙는다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    const cell = screen.getByTestId("project-detail-surface-board").querySelector('[data-surface="ontology"]')!;
    const figureLabels = [...cell.querySelectorAll("dt")].map((node) => node.textContent);
    expect(figureLabels).toEqual(["Domains", "Capabilities", "Elements"]);
    // ...and it names its own scope. This counts only the edges whose two ends are both in this
    // project, which is a smaller number than the folder's relation total shown in the same
    // block — two figures called "relations" in one eyeful, with nothing saying they measure
    // different things.
    expect(cell.querySelector('[data-testid="project-detail-surface-note"]')).toHaveTextContent(
      "3 relations among these concepts",
    );
  });

  /*
   * **One folder, one number.** The strip beside the composition board says "whole folder", so it
   * has to count what every other surface calls a concept — `computeCanonicalCensus`, the rule the
   * map's INDEX row reads. Counting the raw node array added the vault readme, and the same folder
   * read 7 here and 6 on the map, one click apart.
   */
  it("폴더 전체 개념 수는 지도 INDEX 와 같은 규칙으로 센다", () => {
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
    // The folder's relations are not restated beside the ontology cell's own relation count.
    expect(screen.getByTestId("project-detail-global-census")).not.toHaveTextContent(/relation/i);
  });

  // Only the ontology half of the board is this project's; sources and wiki pages count the folder.
  // Two scopes side by side read as one unless the difference is said in words.
  it("구성 판 옆에 스코프 캡션이 붙는다 — 온톨로지만 이 프로젝트의 것이다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByTestId("project-detail-composition")).toHaveTextContent(
      "Sources and wiki pages count the whole folder",
    );
  });

  it("구성 탭의 도메인 행을 펼치면 그 도메인의 지도 딥링크가 나온다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    // Composition sits behind a tab and the URL is the tab state's source of truth. The render contract
    // and the click contract are checked separately: here, "if the URL says composition, the rows are
    // drawn". (Click → URL navigation is Next's job, and the separate test below only checks the URL record.)
    nav.search = "tab=composition";
    renderPage();

    // The card grid lost and the row list took its place — the door to the map is not the whole card but a
    // single link **inside the expanded row** (2026-08-12, option B).
    const row = screen.getByTestId("project-detail-domain-row-toggle");
    expect(row).toHaveTextContent("Views");
    fireEvent.click(row);
    expect(screen.getByTestId("project-detail-domain-map-link")).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=domain%3Aviews",
    );
  });

  // The hero's radial map promised "the fuller a domain, the larger it is", but the measured width
  // difference between 17 and 6 was 4.7px (17 against 16 was 0.3px) and the lines ran through the label.
  // A promise that cannot be kept is a misunderstanding, not ink — instead of layering another picture
  // there, the list lives in a judgeable form (rows plus bars) in **one place only**.
  it("히어로에 방사 도메인 지도가 없다 — 도메인 목록은 구성 탭 한 곳에만 있다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    const { container } = renderPage();
    const header = container.querySelector("header")!;

    /*
     * **An assertion measuring an absence passes forever if the selector is wrong** — so first confirm
     * this selector really does catch such an SVG (`/gate-probe`: is the check idling on an empty set?).
     */
    const probe = document.createElement("div");
    probe.innerHTML = '<svg role="img" aria-label="probe"></svg>';
    header.appendChild(probe);
    expect(header.querySelector("svg[role='img']")).not.toBeNull();
    probe.remove();

    expect(header.querySelector("svg[role='img']")).toBeNull();
    // The hero has no domain rows (the same nine lines are not drawn twice on one screen).
    expect(header.querySelector("[data-testid='domain-capacity-bar-row']")).toBeNull();
  });

  // The same sentence is not said twice — the footnote appears once, where the list is.
  it("겹침 각주는 목록과 같은 자리에 한 번만 나온다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getAllByTestId("project-detail-domain-overlap-note")).toHaveLength(1);
  });

  // The tabs are gone (2026-09-19): the page's question is "what is in here", so composition is
  // not behind a press, and the document's own destination holds the prose the card used to pour out.
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
    // The question is only asked of a folder that holds another project, so the empty state needs
    // one to exist before it can be read.
    mocks.vaultDocs = [projectDoc("project", SLUG), projectDoc("second", "second")];
    renderPage();

    const empty = screen.getByTestId("project-detail-connected-empty");
    expect(empty).toHaveTextContent("Not connected to any other project yet.");
    expect(empty.textContent).not.toMatch(/^0\b/);
  });

  // A folder with one project cannot answer "which other project is this tied to": connecting needs
  // a second project to exist, so the card's empty state would sit at the top of the rail forever.
  it("폴더에 프로젝트가 하나뿐이면 연결 카드를 아예 묻지 않는다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    mocks.vaultDocs = [projectDoc("project", SLUG)];
    renderPage();

    expect(screen.queryByTestId("project-detail-connected-card")).toBeNull();
    // The rail itself stays: the agent card below it is what now opens the column.
    expect(screen.getByTestId("project-detail-connected")).toBeInTheDocument();
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
    renderPage({ project: { dependencies: ["sibling"] }, related });

    expect(screen.getByText("Sibling Project")).toBeInTheDocument();
    expect(screen.queryByTestId("project-detail-connected-empty")).not.toBeInTheDocument();
    // No decorative arrow on a link that navigates inside the app — where it goes is said by the label,
    // and that it is pressable is said by the control.
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

  it("explains the read-only state instead of just omitting the edit entry point (UX 부대 — [P-7])", () => {
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

    // The card summarises: the section titles are the contents line, the opening paragraph is the
    // prose, and the document's own destination holds the rest.
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
    // The contents line names what is written, in order, without pouring the document out.
    const sections = screen.getByTestId("project-detail-brief-sections");
    expect([...sections.querySelectorAll("li")].map((item) => item.textContent?.replace(/^·\s*/, ""))).toEqual([
      "What it does",
      "How work flows",
      "Where it is uneven",
    ]);
    // Only the opening paragraph is drawn, so the steps and rows of later sections are not.
    expect(screen.queryByTestId("project-detail-brief-steps")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-detail-body-content")).toHaveTextContent("A store.");
    expect(screen.getByTestId("project-detail-body-continue")).toBeInTheDocument();
    expect(screen.getByTestId("project-detail-brief-ask")).toHaveAttribute("data-brief-state", "structured");
  });

  // A body can open with a list. The summary used to look for a paragraph, find none, and draw
  // nothing at all about the document — the one thing this card exists to carry.
  it("목록으로 시작하는 본문도 그 첫 블록을 보여준다", () => {
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

    // No `##` heading: the opening paragraph stands alone with no contents line.
    expect(screen.getByTestId("project-detail-body-content")).toHaveTextContent("One paragraph.");
    expect(screen.queryByTestId("project-detail-brief-sections")).not.toBeInTheDocument();
    const ask = screen.getByTestId("project-detail-brief-ask");
    expect(ask).toHaveAttribute("data-brief-state", "unstructured");
    const copy = screen.getByTestId("project-detail-brief-ask-copy");
    expect(copy.className).toContain("--color-indigo-brand");
    // The instructions name the document and the write guard, so the agent changes only the body.
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
