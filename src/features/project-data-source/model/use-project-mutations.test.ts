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

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock("@/features/docs-vault-local", () => ({
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

  it("루트 project 문서를 update할 때 원본 경로와 title key-shape를 보존한다", async () => {
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

  it("partial name patch는 기존 title 키만 바꾸고 다른 필드를 만들지 않는다", async () => {
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

  it("루트 project와 같은 slug의 신규 생성을 거부한다", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await expect(
      act(() => result.current.createProject(makeInput())),
    ).rejects.toThrow('Project slug already exists: "project"');
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it("루트 project 삭제도 원본 VaultDoc.slug를 쓴다", async () => {
    const { result } = renderHook(() => useProjectMutations());

    await act(() => result.current.deleteProject("project"));

    expect(mocks.vault.deleteDoc).toHaveBeenCalledWith("project");
  });
});
