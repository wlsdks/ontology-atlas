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
    expect(summary.compareDocumentPosition(screen.getByRole("tablist"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  it("renders the hero metric strip with real projectIds-derived counts", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // domains=1, capabilities=1, elements=2, documents=1
    // Only the ontology hierarchy (domain ⊃ capability ⊃ element) becomes chips — the value follows the label.
    expect(screen.getByText("Domains").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Capabilities").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Elements").nextElementSibling).toHaveTextContent("2");
  });

  // Five at the same weight reads as "everything matters, so nothing does". Meta figures are a different
  // kind and drop from chips to plain text — pinned so that hierarchy cannot collapse.
  it("메타 수치(문서·관계)는 칩이 아니라 평문으로 강등된다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // As a chip, the label and value would be separate elements and "Documents" would match as its own node.
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(screen.getByText(/Documents\s+1/)).toBeInTheDocument();
  });

  // The hero figures are this project's while the census at the top is the whole vault. Two different
  // numbers on one screen reads as one of them being wrong, so the scope is stated in words.
  it("히어로 지표에 스코프 캡션이 붙는다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByText("This project")).toBeInTheDocument();
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
    // The tab state's source of truth is the URL — in this harness a tab click only records the URL and
    // the real app's router does the re-render. So the two states are rendered separately.
    const { unmount } = renderPage();
    expect(screen.queryByTestId("project-detail-domain-overlap-note")).not.toBeInTheDocument();
    unmount();

    nav.search = "tab=composition";
    renderPage();
    expect(screen.getAllByTestId("project-detail-domain-overlap-note")).toHaveLength(1);
  });

  it("탭을 누르면 URL 에 기록된다 — 공유·에이전트 재현이 가능해야 한다 (#87)", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /composition/i }));
    expect(nav.search).toContain("tab=composition");
  });

  it("기본 탭으로 돌아가면 URL 에서 파라미터가 사라진다 (#87)", () => {
    // A short share link is easy to paste — `?tab=overview` is noise that need not be there.
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    nav.search = "tab=composition";
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /overview/i }));
    expect(nav.search).not.toContain("tab=");
  });

  it("기본은 개요 탭 — 본문이 보이고 구성 카드는 아직 없다 (#87)", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // Owner: "you don't have to show everything by scrolling" — the project.md body runs to thousands of
    // px, so putting it in the same scroll as composition left no way to scan composition.
    expect(screen.queryByTestId("project-detail-domain-rows")).not.toBeInTheDocument();
  });

  it("연결된 프로젝트는 탭 밖에 있다 — 어느 탭에서든 보인다 (#87)", () => {
    // It is the first surface of treating project-to-project relations as ontology, so it must not be
    // hidden behind a tab. It has to stay when switching to the composition tab too.
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    const railBefore = screen.getByTestId("project-detail-connected");
    fireEvent.click(screen.getByRole("tab", { name: /composition/i }));
    expect(screen.getByTestId("project-detail-connected")).toBe(railBefore);
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

    const content = screen.getByTestId("project-detail-body-content");
    expect(content).toHaveTextContent("Real project.md content");
    expect(content).toHaveTextContent("This is the actual markdown body.");
    expect(screen.queryByTestId("project-detail-body-empty")).not.toBeInTheDocument();
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
