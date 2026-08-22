import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectEditorPage } from "./ProjectEditorPage";

const mocks = vi.hoisted(() => ({
  loaded: false,
  projects: [] as never[],
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => mocks.router,
}));

vi.mock("@/features/project-edit", () => ({
  ProjectForm: () => <div data-testid="project-form" />,
}));

vi.mock("@/features/project-data-source", () => ({
  ProjectStaticModeError: class ProjectStaticModeError extends Error {},
  useProjects: () => ({
    projects: mocks.projects,
    loaded: mocks.loaded,
    error: null,
    mode: "local",
  }),
  useProjectMutations: () => ({
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    canCreate: true,
    canEdit: true,
    canDelete: true,
    mode: "local",
  }),
}));

vi.mock("@/features/docs-vault-local", () => ({
  VaultConflictError: class VaultConflictError extends Error {},
  // The write-lock banner's «path to open a folder» — this test covers only the loading contract, so it
  // keeps just the marker. Whether that path actually invokes the picker is measured in a browser by
  // `tests/e2e/open-vault-cta.spec.ts` (a layer no source string can decide).
  OpenVaultCta: ({ testId }: { testId: string }) => <button type="button" data-testid={testId} />,
}));

vi.mock("@/shared/lib/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

/*
 * **A partial mock — the barrel is not replaced wholesale.**
 *
 * The only stub needed here is `useToast` (this renders without the provider). But it used to replace the
 * entire barrel with `{ useToast }`, so the test broke **the moment the component used one more thing**
 * from that barrel — which really happened when `controlClass` was added, dying with *"No controlClass
 * export is defined on the @/shared/ui mock"* and staying that way on `main`.
 *
 * `controlClass` is a pure function needing no provider, so there was never a reason to mock it.
 * Spreading the original and overriding only what is needed stops this class of failure recurring.
 */
vi.mock("@/shared/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/ui")>()),
  useToast: () => ({ show: vi.fn() }),
}));

describe("ProjectEditorPage loading contract", () => {
  beforeEach(() => {
    mocks.loaded = false;
    mocks.projects = [{ slug: "ontology-atlas" }] as never[];
  });

  it("project source 로딩 중에는 not-found로 확정하지 않는다", async () => {
    render(<ProjectEditorPage mode="edit" slug="project" />);

    expect(screen.getByText("loadingLabel")).toBeInTheDocument();
    expect(screen.queryByText("loadErrorEdit")).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("loadingLabel")).toBeInTheDocument();
    expect(screen.queryByText("loadErrorEdit")).not.toBeInTheDocument();
  });

  it("초기 fallback not-found 뒤 로컬 project가 도착하면 편집 폼으로 회복한다", async () => {
    mocks.loaded = true;
    mocks.projects = [{ slug: "ontology-atlas" }] as never[];
    const { rerender } = render(
      <ProjectEditorPage mode="edit" slug="project" />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("loadErrorEdit")).toBeInTheDocument();

    mocks.projects = [
      {
        slug: "project",
        name: "My project",
        tags: [],
        stack: [],
        links: [],
        dependencies: [],
      },
    ] as never[];
    rerender(<ProjectEditorPage mode="edit" slug="project" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("project-form")).toBeInTheDocument();
    expect(screen.queryByText("loadErrorEdit")).not.toBeInTheDocument();
  });
});
