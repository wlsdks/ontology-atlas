import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// A doc slug is its file path while a project slug is the frontmatter `slug:`; comparing them directly misses.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/project-data-source", () => ({
  useSelectedProjectSlug: () => null,
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
    mode: "no-folder",
  }),
  useVaultDocs: () => [
    {
      slug: "ontology/project",
      path: "docs/ontology/project.md",
      title: "ontology-atlas",
      tags: [],
      frontmatter: {
        kind: "project",
        slug: "ontology-atlas",
        description: "A local-first ontology workbench.",
      },
      headings: [],
      excerpt: "정체성 (2026-07): agent-native, human-sovereign...",
      wordCount: 0,
      updatedAt: "2026-07-17T00:00:00.000Z",
      linksOut: [],
    },
  ],
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({ insight: { nodes: [], edges: [] } }),
}));

vi.mock("@/entities/vault-session/model/vault-provider/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-provider/LocalVaultProvider")>()),
  useLocalVault: () => ({ agentActivityStatus: undefined }),
}));
vi.mock("@/entities/vault-session/model/vault-source/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/vault-source/use-data-source-mode")>()),
  useDataSourceMode: () => "no-folder",
}));


vi.mock("@/widgets/app-settings-menu", () => ({
  AppSettingsMenu: () => <button type="button" data-testid="app-settings-trigger-stub" />,
}));

vi.mock("@/widgets/app-nav-rail", () => ({
  useNavRailSettingsSlot: () => {},
}));

function renderPage() {
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <ProjectSelectorPage />
    </IntlProvider>,
  );
}

describe("ProjectSelectorPage card description when the doc slug is a file path", () => {
  it("still finds the doc through the frontmatter slug and shows its description", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(within(card).getByText("A local-first ontology workbench.")).toBeInTheDocument();
    expect(
      within(card).queryByText("This project doesn't have a description yet."),
    ).not.toBeInTheDocument();
  });
});
