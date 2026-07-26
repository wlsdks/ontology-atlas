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
  LiveActivityIndicator: () => <div data-testid="live-activity-indicator-stub" />,
}));

vi.mock("@/features/docs-vault-local", () => ({
  useLocalVault: () => ({ agentActivityStatus: undefined }),
}));

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => "static",
}));

vi.mock("@/widgets/app-settings-menu", () => ({
  AppSettingsMenu: () => <button type="button" data-testid="app-settings-trigger-stub" />,
}));

// #15 — 설정을 나브레일 하단 슬롯으로 옮기면서 페이지가 useNavRailSettingsSlot
// 을 호출한다. 이 훅은 provider 없이는 throw 하므로(레이아웃 상주 계약),
// 페이지 단위 테스트에선 no-op 로 스텁한다.
vi.mock("@/widgets/app-nav-rail", () => ({
  useNavRailSettingsSlot: () => {},
}));

vi.mock("../lib/use-vault-docs", () => ({
  useVaultDocs: () => [
    {
      slug: "capabilities/mcp-server",
      path: "docs/ontology/capabilities/mcp-server.md",
      title: "MCP Server",
      tags: [],
      // 두 생산 경로 모두 `doc.description` 을 frontmatter 의 그 키에서만
      // 채운다 — 발췌 금지 규칙(A2)이 읽는 자리도 frontmatter 다.
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
  // perf/persistent-shell — AppNavRail은 이제 app/[locale]/layout.tsx
  // (AppShell)에 상주하고 이 페이지는 직접 마운트하지 않는다(레일 DOM
  // identity를 라우트 이동 전반에서 유지하기 위함). 그래서 이 unit 테스트는
  // 레일 자체가 아니라, 페이지가 여전히 소유하는 settings/agent-status
  // 클러스터만 단언한다 — 레일 persistence 자체는 Playwright(프로덕션 정적
  // 서빙에서 rail DOM identity 유지)로 검증한다.
  it("mounts the settings/agent-status cluster instead of OperationsNav", () => {
    renderPage();
    expect(screen.getByTestId("app-settings-trigger-stub")).toBeInTheDocument();
    expect(screen.getByTestId("live-activity-indicator-stub")).toBeInTheDocument();
  });

  it("renders the workspace census (concepts/relations) from the unified formula", () => {
    renderPage();
    // P0c 정본 census — project 포함 파생 전체 4 (표면 간 불일치 N2 교정).
    expect(screen.getByText(/4 CONCEPTS/)).toBeInTheDocument();
    expect(screen.getByText(/2 RELATIONS/)).toBeInTheDocument();
  });

  it("renders a recent-activity row sourced from real vault doc mtime", () => {
    renderPage();
    expect(screen.getByTestId("project-selector-activity-row")).toBeInTheDocument();
    expect(screen.getByText("capabilities/mcp-server")).toBeInTheDocument();
    // 2줄 스택 통일 이후 subtitle 은 도메인 + 설명을 한 줄로 합친다
    // (RecentNodeRow — Apple C3 unification). 이 파일의 mock 노드 id 는
    // (kind:folder/slug) tailSlug 계산 규약과 우연히 불일치해 nodeId 매칭이
    // 항상 실패하므로 domainTitle 은 fallback("—")으로 남는다 — 실제 매칭
    // 경로는 ProjectSelectorPage.activity-link.test.tsx 가 전담 검증한다.
    expect(screen.getByText("— · write 도구로 확장")).toBeInTheDocument();
  });

  it("puts the project cards before the recent-activity feed (Toss P1 — primary content first)", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    const activityRow = screen.getByTestId("project-selector-activity-row");
    // DOM order === source order for sibling sections here — compareDocumentPosition
    // confirms the card is earlier in document order than the activity row.
    expect(card.compareDocumentPosition(activityRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a full-width project card with fact strip and domain composition row", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ontology-atlas" })).toBeInTheDocument();
    // fact strip: 1 domain / 1 capability / 1 element / 0 documents / 2 relations
    expect(within(card).getByText("Domains")).toBeInTheDocument();
    expect(within(card).getByText("Views")).toBeInTheDocument();
  });

  it("links the card footer to the project detail and topology pages", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(
      within(card).getByRole("link", { name: "Open ontology-atlas details" }),
    ).toHaveAttribute("href", "/project/fallback/?slug=ontology-atlas");
    expect(within(card).getByRole("link", { name: "View in topology" })).toHaveAttribute(
      "href",
      expect.stringContaining("ontology-atlas"),
    );
  });

  it("shows the always-on next-project dashed slot with CLI and agent handoff rows", () => {
    renderPage();
    expect(screen.getByText("ontology-atlas add --kind project")).toBeInTheDocument();
    expect(screen.getByText('add_concept(slug, kind: "project", title)')).toBeInTheDocument();
  });

  it("points the new-project CTA at /project/new with a returnTo back to /projects/", () => {
    renderPage();
    expect(screen.getByTestId("project-selector-new-cta")).toHaveAttribute(
      "href",
      `/project/new/?returnTo=${encodeURIComponent("/projects/")}`,
    );
  });

  // 감사 D8 — 영어 화면에서 "1 project · 1 domains" 로 나갔다. 셈이 1 일 때
  // 복수형은 문장이 자동 생성됐다는 신호로 읽힌다.
  it("agrees in number with the count it labels", () => {
    renderPage();
    const header = screen.getByRole("main").textContent ?? "";
    expect(header).toContain("1 project");
    expect(header).toContain("1 project·1 domain");
    expect(header).not.toContain("1 domains");
    expect(header).not.toContain("1 CONCEPTS");
    expect(header).not.toContain("1 RELATIONS");
    // 복수 자리도 함께 잠근다 — 단수만 고치면 반대 방향으로 되돌아온다.
    expect(header).toContain("4 CONCEPTS");
    expect(header).toContain("2 RELATIONS");
  });
});
