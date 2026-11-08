import { act, fireEvent, render, screen } from "@testing-library/react";
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
  useLocale: () => 'en',
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
  ProjectForm: ({ onDirtyChange, onCancel }: { onDirtyChange: (dirty: boolean) => void; onCancel: () => void }) => <div data-testid="project-form">
    <button onClick={() => onDirtyChange(true)}>Change field</button>
    <button onClick={onCancel}>Cancel form</button>
  </div>,
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

vi.mock("@/entities/vault-session/model/local-vault/vault-identity-guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/local-vault/vault-identity-guards")>()),
  VaultConflictError: class VaultConflictError extends Error {},
}));
vi.mock("@/features/docs-vault-local", () => ({
  OpenVaultCta: ({ testId }: { testId: string }) => <button type="button" data-testid={testId} />,
}));

vi.mock("@/shared/lib/public-pages/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

/* Only `useToast` is stubbed; replacing the whole barrel breaks on the next export the page uses. */
vi.mock("@/shared/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/ui")>()),
  useToast: () => ({ show: vi.fn() }),
}));

describe("ProjectEditorPage loading contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loaded = false;
    mocks.projects = [{ slug: "ontology-atlas" }] as never[];
  });

  it("does not settle on not-found while the project source is loading", async () => {
    render(<ProjectEditorPage mode="edit" slug="project" />);

    expect(screen.getByText("loadingLabel")).toBeInTheDocument();
    expect(screen.queryByText("loadErrorEdit")).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("loadingLabel")).toBeInTheDocument();
    expect(screen.queryByText("loadErrorEdit")).not.toBeInTheDocument();
  });

  it("recovers to the edit form when a local project arrives after the initial not-found fallback", async () => {
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

async function mountEditableProject() {
  vi.clearAllMocks();
  mocks.loaded = true;
  mocks.projects = [{ slug: 'project', name: 'Project', tags: [], stack: [], links: [], dependencies: [] }] as never[];
  render(<ProjectEditorPage mode="edit" slug="project" returnTo="/project/project/" />);
  await screen.findByTestId('project-form');
}

it('keeps unsaved edits until the person chooses to discard in the app', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await mountEditableProject();
  fireEvent.click(screen.getByText('Change field'));
  fireEvent.click(screen.getByText('Cancel form'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(mocks.router.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'keepEditing' }));
  expect(mocks.router.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('project-editor-back-link'));
  fireEvent.click(screen.getByRole('button', { name: 'discardAndLeave' }));
  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/project/project/');
  expect(confirm).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it('remembers the requested duplicate destination after discard', async () => {
  await mountEditableProject();
  fireEvent.click(screen.getByText('Change field'));
  fireEvent.click(screen.getByTestId('project-editor-duplicate'));
  expect(mocks.router.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'discardAndLeave' }));
  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/project/new/?from=project&returnTo=%2Fproject%2Fproject%2F');
});

it('returns immediately when unchanged and leaves modified clicks native', async () => {
  await mountEditableProject();
  fireEvent.click(screen.getByText('Cancel form'));
  expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/project/project/');
  mocks.router.push.mockClear();
  fireEvent.click(screen.getByText('Change field'));
  expect(fireEvent.click(screen.getByTestId('project-editor-duplicate'), { metaKey: true })).toBe(true);
  expect(mocks.router.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});
