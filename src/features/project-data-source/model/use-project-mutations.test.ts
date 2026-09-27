import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInput } from "@/entities/project";
import type { VaultManifest } from "@/entities/docs-vault";
import { useProjectMutations } from "./use-project-mutations";

const mocks = vi.hoisted(() => ({
  mode: "local" as "local" | "static",
  vault: {
    manifest: null as VaultManifest | null,
    fileHandles: new Map<string, unknown>(),
    createDoc: vi.fn(),
    updateFrontmatter: vi.fn(),
    deleteDoc: vi.fn(),
  },
}));

vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => mocks.mode,
}));
vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => mocks.vault,
}));


function makeManifest(
  docSlug: string,
  projectSlug: string,
  mtime = 123,
): VaultManifest {
  return {
    version: "1",
    generatedAt: "2026-07-25T00:00:00.000Z",
    docs: [
      {
        slug: docSlug,
        path: `${docSlug}.md`,
        title: "My project",
        description: "",
        tags: [],
        frontmatter: {
          kind: "project",
          slug: projectSlug,
          title: "My project",
        },
        headings: [],
        excerpt: "",
        wordCount: 0,
        updatedAt: "2026-07-25",
        linksOut: [],
        mtime,
      },
    ],
    backlinksDetail: {},
    tags: {},
    tree: { name: "vault", path: "", type: "dir", children: [] },
  };
}

function makeInput(slug = "project"): ProjectInput {
  return {
    slug,
    name: "Updated project",
    category: "uncategorized",
    status: "active",
    description: "Updated",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    position: { x: 0, y: 0 },
  };
}

describe("useProjectMutations path-agnostic project source", () => {
  beforeEach(() => {
    mocks.mode = "local";
    mocks.vault.manifest = makeManifest("project", "project");
    mocks.vault.fileHandles = new Map([["project", {}]]);
    mocks.vault.createDoc.mockReset();
    mocks.vault.updateFrontmatter.mockReset();
    mocks.vault.deleteDoc.mockReset();
  });

  it("preserves the source path and title key shape when updating the root project document", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await act(() => result.current.updateProject(makeInput()));

    expect(mocks.vault.updateFrontmatter).toHaveBeenCalledWith(
      "project",
      expect.objectContaining({
        kind: "project",
        slug: "project",
        title: "Updated project",
      }),
      { expectedMtime: 123 },
    );
    expect(
      mocks.vault.updateFrontmatter.mock.calls[0]?.[1],
    ).not.toHaveProperty("name");
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it("a partial name patch changes only the existing title key", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await act(() =>
      result.current.patchProject("project", {
        name: "Renamed project",
      }),
    );

    expect(mocks.vault.updateFrontmatter).toHaveBeenCalledWith(
      "project",
      { title: "Renamed project" },
      { expectedMtime: 123 },
    );
  });

  it("renames starter default display_ko and display_en along with the name", async () => {
    const manifest = makeManifest("project", "project");
    manifest.docs[0].frontmatter = {
      ...manifest.docs[0].frontmatter,
      display_ko: "내 프로젝트",
      display_en: "My project",
    };
    mocks.vault.manifest = manifest;
    const { result } = renderHook(() => useProjectMutations());

    await act(() =>
      result.current.patchProject("project", { name: "아크메 콘솔" }),
    );

    expect(mocks.vault.updateFrontmatter).toHaveBeenCalledWith(
      "project",
      { title: "아크메 콘솔", display_ko: "아크메 콘솔", display_en: "아크메 콘솔" },
      { expectedMtime: 123 },
    );
  });

  it("a display-name patch writes only that locale's display key", async () => {
    const manifest = makeManifest("project", "project");
    manifest.docs[0].frontmatter = {
      ...manifest.docs[0].frontmatter,
      display_ko: "커스텀 이름",
      display_en: "Custom name",
    };
    mocks.vault.manifest = manifest;
    const { result } = renderHook(() => useProjectMutations());

    await act(() =>
      result.current.patchProject("project", { displayName: { locale: "ko", value: "새 이름" } }),
    );

    expect(mocks.vault.updateFrontmatter).toHaveBeenCalledWith(
      "project",
      { display_ko: "새 이름" },
      { expectedMtime: 123 },
    );
  });

  it("keeps user-set display names on rename", async () => {
    const manifest = makeManifest("project", "project");
    manifest.docs[0].frontmatter = {
      ...manifest.docs[0].frontmatter,
      display_ko: "커스텀 이름",
      display_en: "Custom name",
    };
    mocks.vault.manifest = manifest;
    const { result } = renderHook(() => useProjectMutations());

    await act(() => result.current.patchProject("project", { name: "Renamed" }));

    expect(mocks.vault.updateFrontmatter).toHaveBeenCalledWith(
      "project",
      { title: "Renamed" },
      { expectedMtime: 123 },
    );
  });

  it("rejects creating a project with the root project slug", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await expect(
      act(() => result.current.createProject(makeInput())),
    ).rejects.toThrow('Project slug already exists: "project"');
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it("passes markdown with a permanent UUIDv4 uid to createDoc for a new project", async () => {
    mocks.vault.manifest = null;
    mocks.vault.fileHandles = new Map();
    const { result } = renderHook(() => useProjectMutations());

    await act(() => result.current.createProject(makeInput("fresh")));

    expect(mocks.vault.createDoc).toHaveBeenCalledWith(
      "projects/fresh",
      expect.stringMatching(
        /^---\nuid: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n/m,
      ),
    );
  });

  it("deletes the root project by its source VaultDoc slug", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await act(() => result.current.deleteProject("project"));

    expect(mocks.vault.deleteDoc).toHaveBeenCalledWith("project");
  });
});
