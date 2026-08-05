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
}));

vi.mock("@/shared/lib/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

/*
 * **부분 모킹이다 — 배럴을 통째로 갈아치우지 않는다.**
 *
 * 여기서 스텁이 필요한 것은 `useToast` 하나뿐이다(프로바이더 없이 렌더하므로).
 * 그런데 종전엔 배럴 전체를 `{ useToast }` 로 대체해서, 컴포넌트가 같은
 * 배럴에서 **다른 것을 하나라도 더 쓰기 시작하는 순간** 테스트가 깨졌다 —
 * 실제로 `controlClass` 가 추가되면서 *"No controlClass export is defined on
 * the @/shared/ui mock"* 으로 죽었고, 그 상태로 `main` 에 남아 있었다.
 *
 * `controlClass` 는 프로바이더가 필요 없는 순수 함수라 애초에 모킹할 이유가
 * 없다. 원본을 펼친 뒤 필요한 것만 덮으면 이 부류의 실패가 재발하지 않는다.
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
