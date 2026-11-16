import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resetSharedEvidenceWalk, useMapEvidenceStates } from "./use-map-evidence-states";

const git = vi.hoisted(() => ({
  bridge: true,
  walk: vi.fn(),
}));

const DOCS = [
  { slug: "capabilities/pay", frontmatter: { kind: "capability", path: "src/pay.ts" } },
  { slug: "capabilities/ship", frontmatter: { kind: "capability", path: "src/ship.ts" } },
  { slug: "capabilities/list", frontmatter: { kind: "capability", path: "src/list.ts" } },
];
const VAULT = { status: "ready", handle: { name: "vault" }, manifest: { docs: DOCS }, lastLoadedAt: 1 };

vi.mock("@/entities/vault-session", () => ({
  useDataSourceMode: () => "local",
  useLocalVault: () => VAULT,
}));
vi.mock("@/shared/lib/vault-folder/select-open-vault-handle", () => ({
  selectOpenVaultHandle: (_status: string, handle: unknown) => handle,
}));
vi.mock("@/shared/lib/vault-folder/tauri-vault-fs", () => ({
  getTauriVaultRootPath: () => "/vault",
}));
vi.mock("@/shared/lib/git/tauri-git", () => ({
  isGitBridgeAvailable: () => git.bridge,
  gitPathsLastChange: git.walk,
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
  git.bridge = true;
  git.walk.mockReset();
  git.walk.mockResolvedValue(WALK);
});

describe("useMapEvidenceStates", () => {
  it("walks Git once for two screens reading the same folder load, and both read the same states", async () => {
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("measured"));
    await waitFor(() => expect(page.result.current.availability).toBe("measured"));
    expect(git.walk).toHaveBeenCalledTimes(1);
    expect([...page.result.current.states]).toEqual([...map.result.current.states]);
  });

  it("answers a screen that mounts after the walk ended without a reading state", async () => {
    const map = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(map.result.current.availability).toBe("measured"));
    const page = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    expect(page.result.current.availability).toBe("measured");
    expect(git.walk).toHaveBeenCalledTimes(1);
  });

  it("names the file a stale capability stands on: gone, or moved with its date", async () => {
    const { result } = renderHook(() => useMapEvidenceStates({ nodes: NODES, enabled: true }));
    await waitFor(() => expect(result.current.availability).toBe("measured"));
    expect(result.current.states.get("capability:list")).toBe("current");
    expect(result.current.stalePaths.get("capability:pay")).toEqual({ path: "src/pay.ts", gone: false, changedAt: CODE_TIME });
    expect(result.current.stalePaths.get("capability:ship")).toEqual({ path: "src/ship.ts", gone: true, changedAt: null });
    expect(result.current.stalePaths.has("capability:list")).toBe(false);
  });

  it("reads as app-only and never walks without the desktop Git bridge", () => {
    git.bridge = false;
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
