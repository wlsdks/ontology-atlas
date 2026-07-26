import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

// 회귀 가드(2026-07-26) — `VaultDoc.slug` 는 파일 경로(`ontology/project`),
// `Project.slug` 는 frontmatter `slug:`(`ontology-atlas`)다. 카드가 두 값을
// 직접 비교하면 frontmatter 로 slug 를 명시한 프로젝트의 문서를 못 찾아
// "설명이 아직 없는 프로젝트입니다" 로 거짓말한다 — 정작 상세 화면엔 같은
// 설명이 멀쩡히 있었다. 실제 도그푸드 매니페스트와 같은 shape 로 고정한다.
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

vi.mock("@/widgets/app-nav-rail", () => ({
  useNavRailSettingsSlot: () => {},
}));

vi.mock("../lib/use-vault-docs", () => ({
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

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectSelectorPage />
    </NextIntlClientProvider>,
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
