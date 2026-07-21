import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// UX 부대 [P-7] — /projects 최근 활동 행이 지도 딥링크를 갖는지 확인하는
// 전용 회귀 테스트. ProjectSelectorPage.test.tsx 의 공유 mock 노드 id 는
// (kind:folder/slug 형태) 실제 nodeId 계산 규약(kind:tailSlug)과 우연히
// 불일치해 해당 파일에서는 항상 nodeId=null 경로만 검증된다. 이 파일은
// 독립된 mock 세트로 실제 매칭(nodeId 존재) 경로를 검증한다.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
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
        {
          id: "project:ontology-atlas",
          title: "ontology-atlas",
          kind: "project",
          projectIds: [],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
        {
          id: "capability:mcp-server",
          title: "MCP Server",
          kind: "capability",
          projectIds: ["ontology-atlas"],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
      ],
      edges: [],
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

vi.mock("../lib/use-vault-docs", () => ({
  useVaultDocs: () => [
    {
      slug: "ontology/capabilities/mcp-server",
      path: "docs/ontology/capabilities/mcp-server.md",
      title: "MCP Server",
      tags: [],
      frontmatter: { kind: "capability" },
      headings: [],
      excerpt: "",
      description: "write 도구로 확장",
      wordCount: 0,
      updatedAt: "2026-07-18T09:00:00.000Z",
      linksOut: [],
    },
  ],
}));

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectSelectorPage />
    </NextIntlClientProvider>,
  );
}

describe("ProjectSelectorPage recent activity deep link", () => {
  it("renders a matched activity row as a map-focus link, not an inert row", () => {
    renderPage();

    const row = screen.getByTestId("project-selector-activity-row");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/ontology/?node=capability%3Amcp-server");
  });
});
