import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { ProjectSelectorPage } from "./ProjectSelectorPage";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/en/projects/",
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/taxonomy", () => ({
  useTaxonomy: () => ({
    categoryLabel: () => "—",
    statusLabel: () => "—",
    categories: [],
    statuses: [],
  }),
}));

vi.mock("@/features/project-data-source", () => ({
  useProjectMutations: () => ({
    canCreate: false,
    canEdit: false,
    canDelete: false,
    mode: "static",
  }),
  useProjects: () => ({
    projects: [
      {
        slug: "oh-my-ontology",
        name: "oh-my-ontology",
        description: "Local-first ontology workbench",
        tags: [],
        stack: [],
        links: [],
        dependencies: [],
        screenshots: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
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
        node("project:oh-my-ontology", "project", []),
        node("domain:views", "domain", ["oh-my-ontology"]),
        node("capability:agent-graph-readiness", "capability", ["oh-my-ontology"]),
        node("element:insights-query-cockpit", "element", ["oh-my-ontology"]),
      ],
    },
  }),
}));

vi.mock("@/widgets/operations-nav", () => ({
  OperationsNav: () => <nav aria-label="Operations menu" />,
}));

vi.mock("@/widgets/workspace-ontology-strip", () => ({
  WorkspaceOntologyStrip: () => <div data-testid="workspace-ontology-strip" />,
}));

function node(id: string, kind: string, projectIds: string[]) {
  return {
    id,
    title: id,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectSelectorPage />
    </NextIntlClientProvider>,
  );
}

describe("ProjectSelectorPage", () => {
  it("links project ontology counts to the focused graph DB query pack", () => {
    renderPage();

    const focusedProofHref = `/ontology/insights/?node=${encodeURIComponent(
      "oh-my-ontology",
    )}`;

    expect(
      screen.getByRole("link", {
        name: "Open focused graph proof for oh-my-ontology, 3 ontology nodes",
      }),
    ).toHaveAttribute("href", focusedProofHref);
    expect(
      screen.getByRole("link", {
        name: "Open focused graph proof for oh-my-ontology, 3 ontology nodes",
      }).className,
    ).toContain("h-8");
    expect(screen.getByText("Proof · 3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open graph DB query pack for oh-my-ontology",
      }),
    ).toHaveAttribute("href", focusedProofHref);
  });
});
