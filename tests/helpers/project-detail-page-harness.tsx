/**
 * The page's mocks and render helper, shared by its test files. Imported first, so the
 * mocks are registered before the page and its dependencies load.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { LocalVaultProvider } from "@/entities/vault-session";
import { vi } from "vitest";
import enMessages from "../../messages/en.json";
import { ProjectDetailPage } from "@/views/project-detail/ui/ProjectDetailPage";

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
  useConstructionReviewSession: () => hoistedMocks.constructionReview,
}));
// The real hook reaches the desktop bridge.
vi.mock("@/views/project-detail/lib/use-project-agent", () => ({
  useProjectAgent: () => hoistedMocks.agent,
}));
vi.mock("@/views/project-detail/ui/parts/ProjectAgentDock", () => ({
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
      return hoistedMocks.handle ? { ...vault, handle: hoistedMocks.handle as unknown as FileSystemDirectoryHandle } : vault;
    },
  };
});
export function ontologyNode(
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

export function containsEdge(from: string, to: string) {
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

export const SLUG = "ontology-atlas";
const PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const SOURCE_DIGEST = `sha256:${"b".repeat(64)}`;

export function constructionEnvelope(overrides: {
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

export const BASE_NODES = [
  ontologyNode(`project:${SLUG}`, "project", [], "ontology-atlas"),
  ontologyNode("domain:views", "domain", [SLUG], "Views"),
  ontologyNode("capability:mcp-server", "capability", [SLUG], "MCP Server"),
  ontologyNode("element:cli", "element", [SLUG], "CLI"),
  ontologyNode("element:cli-2", "element", [SLUG], "CLI 2"),
  ontologyNode("document:readme", "document", [SLUG], "README"),
];

export const BASE_EDGES = [
  containsEdge("domain:views", "capability:mcp-server"),
  containsEdge("domain:views", "element:cli"),
  containsEdge("capability:mcp-server", "element:cli-2"),
];

const hoistedMocks = vi.hoisted(() => ({
  evidenceReads: 0,
  dialogGroupings: 0,
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
    insight: { nodes: hoistedMocks.insightNodes, edges: hoistedMocks.insightEdges },
    error: null,
  }),
  useMapEvidenceStates: () => {
    hoistedMocks.evidenceReads += 1;
    return hoistedMocks.evidence;
  },
  useAdaptiveRecentChanges: () => hoistedMocks.recent,
  useVaultConceptFacts: () => hoistedMocks.conceptFacts,
}));

vi.mock("@/views/project-detail/model/project-to-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/views/project-detail/model/project-to-check")>();
  return {
    ...actual,
    groupRowsByReason: (...args: Parameters<typeof actual.groupRowsByReason>) => {
      hoistedMocks.dialogGroupings += 1;
      return actual.groupRowsByReason(...args);
    },
  };
});

vi.mock("@/features/project-data-source", () => ({
  useProjects: () => ({
    projects: hoistedMocks.projects,
    loaded: true,
    error: null,
    mode: hoistedMocks.projectsMode,
  }),
  useProjectMutations: () => ({
    canCreate: false,
    canEdit: hoistedMocks.canEdit,
    canDelete: false,
    mode: "static",
    updateProject: vi.fn(),
    patchProject: vi.fn(),
  }),
  useProjectBody: () => ({ body: hoistedMocks.vaultBody }),
  useVaultDocs: () => hoistedMocks.vaultDocs,
  useVaultManifest: () => hoistedMocks.vaultManifest,
}));

export function projectDoc(slug: string, projectSlug: string) {
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

export function baseProject() {
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
export function renderPage(
  overrides: {
    related?: ReturnType<typeof baseProject>[];
    project?: Partial<React.ComponentProps<typeof ProjectDetailPage>["initialProject"]>;
  } = {},
) {
  const project = { ...baseProject(), ...overrides.project };
  // The static source lists the project too, or the page settles to not-found after a press.
  if (hoistedMocks.projectsMode === "static" && hoistedMocks.projects.length === 0) {
    hoistedMocks.projects = [project as ReturnType<typeof baseProject>, ...(overrides.related ?? [])];
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

export function openMoreMenu() {
  fireEvent.click(screen.getByTestId("project-detail-more"));
  return screen.getByTestId("project-detail-more-menu");
}

/** The state every case starts from. */
export function resetProjectDetailMocks() {
  nav.search = "";
  hoistedMocks.evidenceReads = 0;
  hoistedMocks.dialogGroupings = 0;
  hoistedMocks.evidence = { availability: "app-only", states: new Map(), movedPaths: new Map(), stalePaths: new Map() };
  hoistedMocks.recent = { reading: false, windowDays: 7, rows: [], recentNodeIds: new Set() };
  hoistedMocks.conceptFacts = new Map();
  hoistedMocks.vaultBody = null;
  hoistedMocks.projects = [];
  hoistedMocks.projectsMode = "static";
  hoistedMocks.vaultDocs = [];
  hoistedMocks.vaultManifest = null;
  hoistedMocks.handle = null;
  hoistedMocks.agent = {
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
  hoistedMocks.constructionReview = {
    status: "idle",
    review: null,
    errorState: null,
    openPicker: vi.fn(),
    readFile: vi.fn(),
    inputProps: {},
  };
}

/** The mocks' shared state; each case resets it with `resetProjectDetailMocks`. */
export const mocks = hoistedMocks;

