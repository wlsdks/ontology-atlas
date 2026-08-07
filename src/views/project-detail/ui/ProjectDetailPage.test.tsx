import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { LocalVaultProvider } from "@/features/docs-vault-local";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectDetailPage } from "./ProjectDetailPage";

// 탭 상태가 **URL 에 산다**(#87) — 공유·에이전트 재현을 위해. 실앱에서는
// `router.replace` 가 리렌더를 일으켜 `useSearchParams` 가 새 값을 준다.
// 테스트에서 둘 다 목이면 그 루프가 끊기므로, 여기서 이어 붙인다.
const nav = vi.hoisted(() => ({ search: "", version: 0 }));

vi.mock("next/navigation", () => ({
  // `version` 을 읽어 replace 후 리렌더 시 새 인스턴스를 만든다.
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
  vaultBody: null as string | null,
  projects: [] as ReturnType<typeof baseProject>[],
  projectsMode: "static" as "static" | "local",
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
 * 렌더 하네스는 **하나**다. 예전에는 이 함수 말고도 같은 트리를 손으로 두 번
 * 더 적어 뒀는데, provider 를 하나 더할 일이 생기자 그 둘만 빠졌다 —
 * 사본이 있는 곳이 어긋나는 곳이다.
 */
function renderPage(
  overrides: {
    related?: ReturnType<typeof baseProject>[];
    project?: Partial<React.ComponentProps<typeof ProjectDetailPage>["initialProject"]>;
  } = {},
) {
  return render(
    // 이 화면은 「보기 전용」 배지 옆에 폴더 여는 길을 놓는다 — 그 부품이
    // 볼트 컨텍스트를 읽으므로 provider 가 필요하다(2026-08-07 막다른 CTA).
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
    // 탭은 URL 상태라 테스트 간에 새지 않게 초기화한다.
    nav.search = "";
    mocks.vaultBody = null;
    mocks.projects = [];
    mocks.projectsMode = "static";
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

  it("renders the hero metric strip with real projectIds-derived counts", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // domains=1, capabilities=1, elements=2, documents=1
    // 온톨로지 위계(도메인 ⊃ 역량 ⊃ 요소)만 칩이다 — 라벨 다음에 값이 붙는다.
    expect(screen.getByText("Domains").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Capabilities").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Elements").nextElementSibling).toHaveTextContent("2");
  });

  // 5개를 같은 무게로 두면 "다 중요하다 = 다 안 중요하다" 가 된다. 메타 수치는
  // 종류가 달라 칩이 아니라 평문으로 내려간다 — 이 위계가 무너지지 않게 고정.
  it("메타 수치(문서·관계)는 칩이 아니라 평문으로 강등된다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    // 칩이었다면 라벨과 값이 별 엘리먼트라 "Documents" 단독 노드가 잡힌다.
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(screen.getByText(/Documents\s+1/)).toBeInTheDocument();
  });

  // 히어로 수치는 이 프로젝트 몫이고 상단 census 는 볼트 전체다. 같은 화면에
  // 다른 두 수가 있으면 하나가 틀린 것처럼 읽히므로 스코프를 말로 밝힌다.
  it("히어로 지표에 스코프 캡션이 붙는다", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    renderPage();

    expect(screen.getByText("This project")).toBeInTheDocument();
  });

  it("links each domain composition card to its topology focus deep-link", () => {
    mocks.insightNodes = BASE_NODES;
    mocks.insightEdges = BASE_EDGES;
    mocks.canEdit = false;
    // #87 — 구성은 탭 뒤에 있고 탭 상태는 URL 이 진실원이다. 렌더 계약과
    // 클릭 계약을 나눠 검사한다: 여기서는 "URL 이 구성이면 카드가 그려진다".
    // (클릭 → URL 이동은 Next 의 일이라 아래 별 테스트가 URL 기록만 본다.)
    nav.search = "tab=composition";
    renderPage();

    const card = screen.getByTestId("project-detail-domain-card");
    expect(card).toHaveAttribute("href", "/topology/?mode=focus&p=domain%3Aviews");
    expect(card).toHaveTextContent("Views");
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
    // 공유 링크가 짧아야 붙여넣기 쉽다 — `?tab=overview` 는 없어도 될 소음이다.
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

    // 소유자: "스크롤로 모든거 보여주려 안해도 되니까?" — project.md 본문이
    // 수천 px 라 구성과 같은 스크롤에 두면 구성을 스캔할 방법이 없었다.
    expect(screen.queryByTestId("project-detail-domain-card")).not.toBeInTheDocument();
  });

  it("연결된 프로젝트는 탭 밖에 있다 — 어느 탭에서든 보인다 (#87)", () => {
    // 프로젝트 간 관계를 온톨로지로 다루는 방향의 첫 표면이라 탭 뒤에 숨기면
    // 안 된다. 구성 탭으로 옮겨도 그대로 있어야 한다.
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
    // 앱 안에서 이동하는 링크에 장식 화살표를 붙이지 않는다 — 어디로 가는지는
    // 라벨이, 누를 수 있다는 건 컨트롤이 이미 말한다.
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

    expect(screen.queryByTestId("project-detail-domain-card")).not.toBeInTheDocument();
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
