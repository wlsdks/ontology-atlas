import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resetSharedEvidenceWalk, useMapEvidenceStates } from "./use-map-evidence-states";

const git = vi.hoisted(() => ({
  walk: vi.fn(),
  texts: vi.fn(),
  root: "/vault",
  docs: [] as { slug: string; frontmatter: Record<string, unknown> }[],
  vault: null as unknown,
  builds: 0,
}));

const DOCS = [
  { slug: "capabilities/pay", frontmatter: { kind: "capability", path: "src/pay.ts" } },
  { slug: "capabilities/ship", frontmatter: { kind: "capability", path: "src/ship.ts" } },
  { slug: "capabilities/list", frontmatter: { kind: "capability", path: "src/list.ts" } },
];

vi.mock("@/entities/vault-session", () => ({
  useDataSourceMode: () => "local",
  useLocalVault: () => git.vault,
}));
vi.mock("@/shared/lib/vault-folder/select-open-vault-handle", () => ({
  selectOpenVaultHandle: (_status: string, handle: unknown) => handle,
}));
vi.mock("@/shared/lib/vault-folder/native-vault/tauri-vault-runtime", () => ({
  getTauriVaultRootPath: () => git.root,
}));
vi.mock("@/shared/lib/git/evidence-states", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/git/evidence-states")>();
  return {
    ...actual,
    buildEvidenceConcepts: (...args: Parameters<typeof actual.buildEvidenceConcepts>) => {
      git.builds += 1;
      return actual.buildEvidenceConcepts(...args);
    },
  };
});
const verdict = vi.hoisted(() => ({ judged: 0 }));
vi.mock("@/shared/lib/git/evidence-verdict.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/git/evidence-verdict.mjs")>();
  return {
    ...actual,
    unchangedEvidencePairs: (...args: Parameters<typeof actual.unchangedEvidencePairs>) => {
      verdict.judged += args[0].length;
      return actual.unchangedEvidencePairs(...args);
    },
  };
});
vi.mock("@/shared/lib/git/tauri-git", () => ({
  gitPathsLastChange: git.walk,
  gitEvidenceTextPairs: git.texts,
}));

const node = (slug: string): KnowledgeGraphNode => ({
  id: `capability:${slug}`,
  title: slug,
  kind: "capability",
  projectIds: ["shop"],
  evidenceIds: [`capabilities/${slug}`],
  lastApprovedAt: new Date(0),
  lastApprovedBy: "test",
});
const NODES = [node("pay"), node("ship"), node("list")];
const DOC_TIME = "2026-11-01T00:00:00Z";
const CODE_TIME = "2026-11-10T00:00:00Z";
const WALK = [
  { path: "capabilities/pay.md", exists: true, isDir: false, lastChangedAt: DOC_TIME },
  { path: "capabilities/ship.md", exists: true, isDir: false, lastChangedAt: DOC_TIME },
  { path: "capabilities/list.md", exists: true, isDir: false, lastChangedAt: CODE_TIME },
  { path: "src/pay.ts", exists: true, isDir: false, lastChangedAt: CODE_TIME },
  { path: "src/ship.ts", exists: false, isDir: false, lastChangedAt: null },
  { path: "src/list.ts", exists: true, isDir: false, lastChangedAt: DOC_TIME },
];

beforeEach(() => {
  resetSharedEvidenceWalk();
  git.root = "/vault";
  git.builds = 0;
  git.docs = DOCS;
  git.vault = { status: "ready", handle: { name: "vault" }, manifest: { get docs() { return git.docs; } }, lastLoadedAt: 1 };
  git.walk.mockReset();
  git.walk.mockResolvedValue(WALK);
  git.texts.mockReset();
  git.texts.mockResolvedValue([]);
});

describe("useMapEvidenceStates", () => {
  const PAY_COMMIT = "b".repeat(40);
  const COMMITTED_WALK = WALK.map((row) => (row.path === "capabilities/pay.md" ? { ...row, lastCommit: PAY_COMMIT } : row));

  it("keeps a capability current when its moved file changed only in comments since its document", async () => {
    git.walk.mockResolvedValue(COMMITTED_WALK);
    git.texts.mockResolvedValue([
      { path: "src/pay.ts", commit: PAY_COMMIT, before: "// old\nexport const pay = 1;\n", after: "// new\nexport const pay = 1;\n" },
    ]);
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("measured"));
    expect(git.texts).toHaveBeenCalledWith("/vault", [{ commit: PAY_COMMIT, path: "src/pay.ts" }]);
    expect(map.result.current.states.get("capability:pay")).toBe("current");
  });

  it("keeps it stale when the code changed or the old file could not be read", async () => {
    git.walk.mockResolvedValue(COMMITTED_WALK);
    git.texts
      .mockResolvedValueOnce([{ path: "src/pay.ts", commit: PAY_COMMIT, before: "export const pay = 1;\n", after: "export const pay = 2;\n" }])
      .mockRejectedValueOnce(new Error("git-not-runnable"));
    const first = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(first.result.current.availability).toBe("measured"));
    expect(first.result.current.states.get("capability:pay")).toBe("stale");
    first.unmount();
    resetSharedEvidenceWalk();
    const second = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(second.result.current.availability).toBe("measured"));
    expect(second.result.current.states.get("capability:pay")).toBe("stale");
  });

  it("reads every moved pair in chunks, the last one included, and keeps a capability current only when all are unchanged", async () => {
    const files = Array.from({ length: 300 }, (_, index) => `many/f${String(index).padStart(3, "0")}.ts`);
    const elements = files.map((path, index) => ({ slug: `elements/e${index}`, frontmatter: { kind: "element", path } }));
    git.docs = [
      { slug: "capabilities/many", frontmatter: { kind: "capability", elements: elements.map((element) => element.slug) } },
      ...elements,
    ];
    git.walk.mockResolvedValue([
      { path: "capabilities/many.md", exists: true, isDir: false, lastChangedAt: DOC_TIME, lastCommit: PAY_COMMIT },
      ...files.map((path) => ({ path, exists: true, isDir: false, lastChangedAt: CODE_TIME })),
    ]);
    const echo = (changedPath: string | null) => async (_root: string, pairs: { commit: string; path: string }[]) =>
      pairs.map((pair) => ({ ...pair, before: "export const v = 1;\n", after: pair.path === changedPath ? "export const v = 2;\n" : "// why\nexport const v = 1;\n" }));
    git.texts.mockImplementation(echo(null));
    const many = renderHook(() => useMapEvidenceStates({ nodes: [node("many")], enabled: true }));
    await waitFor(() => expect(many.result.current.availability).toBe("measured"));
    expect(git.texts.mock.calls.map((call) => call[1].length)).toEqual([256, 44]);
    expect(many.result.current.states.get("capability:many")).toBe("current");
    many.unmount();

    resetSharedEvidenceWalk();
    git.texts.mockReset();
    git.texts.mockImplementation(echo(files.at(-1)!));
    const changed = renderHook(() => useMapEvidenceStates({ nodes: [node("many")], enabled: true }));
    await waitFor(() => expect(changed.result.current.availability).toBe("measured"));
    expect(changed.result.current.states.get("capability:many")).toBe("stale");
  });

  it("reuses a pair's verdict while its working file is unchanged, and judges again when it changes", async () => {
    git.walk.mockResolvedValue(COMMITTED_WALK);
    const reading = (after: string) => [{ path: "src/pay.ts", commit: PAY_COMMIT, before: "export const pay = 1;\n", after }];
    git.texts.mockResolvedValue(reading("// a\nexport const pay = 1;\n"));
    const first = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(first.result.current.states.get("capability:pay")).toBe("current"));
    const judged = verdict.judged;

    // A new folder load walks again; the same working text is not normalized again.
    git.vault = { ...(git.vault as object), lastLoadedAt: 2 };
    first.rerender();
    await waitFor(() => expect(git.texts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(first.result.current.states.get("capability:pay")).toBe("current"));
    expect(verdict.judged).toBe(judged);

    git.texts.mockResolvedValue(reading("export const pay = 2;\n"));
    git.vault = { ...(git.vault as object), lastLoadedAt: 3 };
    first.rerender();
    await waitFor(() => expect(first.result.current.states.get("capability:pay")).toBe("stale"));
    expect(verdict.judged).toBe(judged + 1);
  });

  it("walks Git once for two screens reading the same folder load, and both read the same states", async () => {
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("measured"));
    await waitFor(() => expect(page.result.current.availability).toBe("measured"));
    expect(git.walk).toHaveBeenCalledTimes(1);
    expect([...page.result.current.states]).toEqual([...map.result.current.states]);
  });

  it("answers a later screen with the last answer at once, then with a walk that sees a newer commit", async () => {
    const committed = WALK.map((row) => (row.path === "src/list.ts" ? { ...row, lastChangedAt: "2026-11-20T00:00:00Z" } : row));
    git.walk.mockResolvedValueOnce(WALK).mockResolvedValueOnce(committed);
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("measured"));
    map.unmount();
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    expect(page.result.current.availability).toBe("measured");
    expect(page.result.current.states.get("capability:list")).toBe("current");
    await waitFor(() => expect(page.result.current.states.get("capability:list")).toBe("stale"));
    expect(git.walk).toHaveBeenCalledTimes(2);
  });

  it("never keeps a failed walk: the next screen walks again and measures", async () => {
    git.walk.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce(WALK);
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("unreadable"));
    map.unmount();
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    expect(page.result.current.availability).toBe("reading");
    await waitFor(() => expect(page.result.current.availability).toBe("measured"));
    expect(git.walk).toHaveBeenCalledTimes(2);
  });

  it("never shows one folder's answer for another, even when the first walk ends after the switch", async () => {
    let finishFirst: (rows: typeof WALK) => void = () => {};
    const otherFolder = WALK.map((row) => (row.path === "src/list.ts" ? { ...row, lastChangedAt: "2026-11-20T00:00:00Z" } : row));
    git.walk.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve))).mockResolvedValueOnce(otherFolder);
    const screen = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    git.root = "/other";
    screen.rerender();
    await waitFor(() => expect(screen.result.current.states.get("capability:list")).toBe("stale"));
    await act(async () => finishFirst(WALK));
    expect(screen.result.current.states.get("capability:list")).toBe("stale");
    expect(git.walk.mock.calls.map((call) => call[0])).toEqual(["/vault", "/other"]);
  });

  it("names the file a stale capability stands on: gone, or moved with its date", async () => {
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(result.current.availability).toBe("measured"));
    expect(result.current.states.get("capability:list")).toBe("current");
    expect(result.current.stalePaths.get("capability:pay")).toEqual({ path: "src/pay.ts", gone: false, changedAt: CODE_TIME });
    expect(result.current.stalePaths.get("capability:ship")).toEqual({ path: "src/ship.ts", gone: true, changedAt: null });
    expect(result.current.stalePaths.has("capability:list")).toBe(false);
  });

  it("compares every document and path of a folder larger than one native walk answers", async () => {
    const limit = 512;
    const slugs = Array.from({ length: 600 }, (_, index) => `c${index}`);
    git.docs = slugs.map((slug) => ({ slug: `capabilities/${slug}`, frontmatter: { kind: "capability", path: `src/${slug}.ts` } }));
    // Like the native walk: documents first, and nothing past the limit.
    git.walk.mockImplementation(async (_root: string, repoPaths: string[], vaultPaths: string[]) =>
      [...vaultPaths, ...repoPaths].slice(0, limit).map((path) => ({
        path,
        exists: true,
        isDir: false,
        lastChangedAt: path.startsWith("src/") ? CODE_TIME : DOC_TIME,
      })),
    );
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: slugs.map(node), enabled: true }));
    await waitFor(() => expect(result.current.availability).toBe("measured"));
    expect(result.current.states.size).toBe(600);
    expect([...result.current.states.values()].every((state) => state === "stale")).toBe(true);
    for (const [, repoPaths, vaultPaths] of git.walk.mock.calls) expect(repoPaths.length + vaultPaths.length).toBeLessThanOrEqual(limit);
  });

  it("names the moved file when a capability has both a moved and a gone one, as the map does", async () => {
    git.docs = [
      { slug: "capabilities/pay", frontmatter: { kind: "capability", path: "src/pay.ts", elements: ["elements/old-ledger"] } },
      { slug: "elements/old-ledger", frontmatter: { kind: "element", path: "src/gone.ts" } },
    ];
    git.walk.mockResolvedValue([
      { path: "capabilities/pay.md", exists: true, isDir: false, lastChangedAt: DOC_TIME },
      { path: "src/gone.ts", exists: false, isDir: false, lastChangedAt: null },
      { path: "src/pay.ts", exists: true, isDir: false, lastChangedAt: CODE_TIME },
    ]);
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: [node("pay")], enabled: true }));
    await waitFor(() => expect(result.current.availability).toBe("measured"));
    expect(result.current.stalePaths.get("capability:pay")).toEqual({ path: "src/pay.ts", gone: false, changedAt: CODE_TIME });
    expect(result.current.movedPaths.get("capability:pay")).toBe("src/pay.ts");
  });

  it("builds the concepts once for repeated renders, and not at all without a folder or for a view that draws no evidence", async () => {
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(page.result.current.availability).toBe("measured"));
    page.rerender();
    page.rerender();
    expect(git.builds).toBe(1);
    page.unmount();

    git.builds = 0;
    const hidden = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: false }));
    hidden.rerender();
    expect(git.builds).toBe(0);
    hidden.unmount();

    git.vault = { ...(git.vault as object), handle: null };
    const noFolder = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    noFolder.rerender();
    expect(git.builds).toBe(0);
    expect(git.walk).toHaveBeenCalledTimes(1);
  });

  it("reads as app-only and never walks while no folder is loaded", () => {
    git.vault = { ...(git.vault as object), handle: null };
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    expect(result.current.availability).toBe("app-only");
    expect(result.current.stalePaths.size).toBe(0);
    expect(git.walk).not.toHaveBeenCalled();
  });

  it("reads as unreadable when the walk fails", async () => {
    git.walk.mockRejectedValue(new Error("no repository"));
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(result.current.availability).toBe("unreadable"));
  });
});
