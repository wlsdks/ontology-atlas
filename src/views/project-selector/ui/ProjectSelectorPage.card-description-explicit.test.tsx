import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// Toss P2 companion — when the user *does* write a frontmatter
// `description:`, the card must show exactly that, not the entity-layer
// excerpt fallback.
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
        description: "정체성 (2026-07): agent-native, human-sovereign...",
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
  useOntologyInsight: () => ({ insight: { nodes: [], edges: [] } }),
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
      slug: "ontology-atlas",
      path: "docs/ontology/project.md",
      title: "ontology-atlas",
      tags: [],
      frontmatter: { kind: "project", description: "A local-first ontology workbench." },
      headings: [],
      excerpt: "정체성 (2026-07): agent-native, human-sovereign...",
      wordCount: 0,
      updatedAt: "2026-07-17T00:00:00.000Z",
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

describe("ProjectSelectorPage card description with an explicit frontmatter description", () => {
  it("shows the user-written description", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(within(card).getByText("A local-first ontology workbench.")).toBeInTheDocument();
    expect(within(card).queryByText(/agent-native, human-sovereign/)).not.toBeInTheDocument();
  });
});
