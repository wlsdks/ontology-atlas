import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// A dedicated regression test for whether a `/projects` recent-activity row carries a map deeplink.
// The shared mock node ids in `ProjectSelectorPage.test.tsx` (of the form kind:folder/slug) happen not to
// match the real nodeId convention (kind:tailSlug), so that file only ever exercises the nodeId=null
// path. This file uses an independent mock set to exercise the real matching path (nodeId present).
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

vi.mock("@/widgets/app-nav-rail", () => ({
  useNavRailSettingsSlot: () => {},
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
