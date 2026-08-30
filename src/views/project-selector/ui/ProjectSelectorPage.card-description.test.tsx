import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// The card must show only the single line a user wrote themselves in `description:` frontmatter.
// `Project.description` (the entity layer) contracts to fall back to a body excerpt when frontmatter has
// no description, so this mock deliberately feeds in "excerpt-shaped" internal positioning copy that
// fallback would produce, verifying the card never exposes it — the real incident was
// `docs/ontology/project.md`, whose identity paragraph leaked out as an excerpt with no description key.
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
        description:
          "정체성 (2026-07): agent-native, human-sovereign. 에이전트를 위한 메모리가 아니라...",
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
}));

vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => ({ agentActivityStatus: undefined }),
}));
vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => "static",
}));
vi.mock("@/entities/vault-session/ui/VaultSourceHydrationBoundary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/ui/VaultSourceHydrationBoundary")>()),
  VaultSourceHydrationBoundary: ({ children }: { children: ReactNode }) => children,
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
      slug: "ontology-atlas",
      path: "docs/ontology/project.md",
      title: "ontology-atlas",
      tags: [],
      frontmatter: { kind: "project" },
      headings: [],
      excerpt: "정체성 (2026-07): agent-native, human-sovereign. 에이전트를 위한 메모리가 아니라...",
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

describe("ProjectSelectorPage card description without frontmatter description", () => {
  it("falls back to the neutral empty-state copy, never the raw excerpt/entity description", () => {
    renderPage();
    const card = screen.getByTestId("project-selector-card");
    expect(within(card).getByText("This project doesn't have a description yet.")).toBeInTheDocument();
    expect(within(card).queryByText(/agent-native, human-sovereign/)).not.toBeInTheDocument();
  });
});
