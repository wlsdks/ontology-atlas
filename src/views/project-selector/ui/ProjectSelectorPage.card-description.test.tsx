import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// Toss P2 — 카드는 사용자가 `description:` frontmatter 에 직접 쓴 한 줄만
// 보여줘야 한다. `Project.description` (엔티티 레이어)은 frontmatter 에
// description 이 없으면 body 발췌(excerpt)로 fallback 하는 계약이라, 이
// mock 은 그 fallback 이 만들어낼 법한 "excerpt-shaped" 내부 포지셔닝 카피를
// 일부러 흘려 넣어 카드가 그걸 절대 노출하지 않는지 검증한다 — 실제 사고
// 사례가 `docs/ontology/project.md` (description 키 없이 정체성 문단이
// excerpt 로 새 나갔다).
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
