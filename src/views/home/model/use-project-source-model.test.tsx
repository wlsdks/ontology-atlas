import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { createMemoryProjectSourceStore } from "@/shared/lib/project-source-store";
import type { ProjectSourceInspection } from "@/shared/lib/tauri-vault-fs";
import {
  loadProjectSourceSnapshot,
  projectSlugForSource,
  useProjectSourceModel,
  type ProjectSourceRuntime,
} from "./use-project-source-model";

const nodes: KnowledgeGraphNode[] = [
  {
    id: "project:music",
    kind: "project",
    title: "Music",
    agentSlug: "music",
    projectIds: [],
    evidenceIds: ["music"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  },
  {
    id: "capability:play",
    kind: "capability",
    title: "Play",
    agentSlug: "capabilities/play",
    projectIds: ["music"],
    evidenceIds: ["capabilities/play"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  },
];

const docs: VaultDoc[] = [
  {
    slug: "music",
    path: "music.md",
    title: "Music",
    tags: [],
    frontmatter: { kind: "project", title: "Music", capabilities: ["capabilities/play"] },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-08-02",
    linksOut: [],
  },
  {
    slug: "capabilities/play",
    path: "capabilities/play.md",
    title: "Play",
    tags: [],
    frontmatter: { kind: "capability", title: "Play", path: "src/play.ts" },
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt: "2026-08-02",
    linksOut: [],
  },
];

const inspection: ProjectSourceInspection = {
  rootPath: "/private/work/music",
  sourceId: "source-music",
  kind: "git",
  revision: "abc123",
  fingerprint: "git:abc123:clean",
  dirty: false,
  truncated: false,
  files: ["src/play.ts"],
};

function createFakeVaultHandle() {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const fileHandle = (path: string) => ({
    getFile: async () => {
      if (!files.has(path)) throw new DOMException("not found", "NotFoundError");
      return { text: async () => files.get(path)! };
    },
    createWritable: async () => {
      let text = "";
      return {
        write: async (chunk: string) => { text += chunk; },
        close: async () => { files.set(path, text); },
      };
    },
  });
  const handle = {
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      if (!directories.has(name)) {
        if (!options?.create) throw new DOMException("not found", "NotFoundError");
        directories.add(name);
      }
      return {
        getFileHandle: async (name: string, options?: { create?: boolean }) => {
          const path = `.ontology-atlas/${name}`;
          if (!files.has(path) && !options?.create) {
            throw new DOMException("not found", "NotFoundError");
          }
          return fileHandle(path);
        },
      };
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files };
}

function runtime(overrides: Partial<ProjectSourceRuntime> = {}): ProjectSourceRuntime {
  return {
    available: () => true,
    pickRoot: async () => inspection.rootPath,
    inspect: async () => inspection,
    rootPathOf: () => null,
    now: () => "2026-08-02T12:00:00.000Z",
    restoreFocus: vi.fn(),
    ...overrides,
  };
}

describe("project source model", () => {
  it("uses the canonical agent slug for a project root", () => {
    expect(projectSlugForSource(nodes[0])).toBe("music");
    expect(projectSlugForSource(nodes[1])).toBeNull();
  });

  it("loads a missing sidecar as unmeasured rather than a failure or score", async () => {
    const snapshot = await loadProjectSourceSnapshot({
      store: createMemoryProjectSourceStore(),
      projectSlug: "music",
      graphHash: "project-graph-v1:test",
    });

    expect(snapshot.view).toMatchObject({
      status: "not_measured",
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
    });
    expect(JSON.stringify(snapshot.view)).not.toMatch(/percent|confidence|score/i);
  });

  it("keeps cancellation silent, preserves the receipt view, and restores trigger focus", async () => {
    const vault = createFakeVaultHandle();
    const restoreFocus = vi.fn();
    const picker = vi.fn(async () => null);
    const sourceRuntime = runtime({ pickRoot: picker, restoreFocus });
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));
    await waitFor(() => expect(result.current.view?.status).toBe("not_measured"));
    const before = result.current.view;

    await act(async () => { await result.current.runNextAction(); });

    expect(picker).toHaveBeenCalledTimes(1);
    expect(result.current.view).toEqual(before);
    expect(result.current.error).toBeNull();
    expect(vault.files.has(".ontology-atlas/project-sources.json")).toBe(false);
    expect(restoreFocus).toHaveBeenCalledWith(trigger);
    trigger.remove();
  });

  it("writes only after inspection and exposes the verified receipt immediately", async () => {
    const vault = createFakeVaultHandle();
    const inspect = vi.fn(async () => inspection);
    const sourceRuntime = runtime({ inspect });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));
    await waitFor(() => expect(result.current.view?.status).toBe("not_measured"));

    await act(async () => { await result.current.runNextAction(); });

    expect(inspect).toHaveBeenCalledWith(inspection.rootPath);
    expect(result.current.view).toMatchObject({
      status: "verified_current",
      currentness: "current",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
    });
    const raw = vault.files.get(".ontology-atlas/project-sources.json") ?? "";
    expect(raw).toContain(inspection.rootPath);
    expect(JSON.stringify(result.current.view)).not.toContain(inspection.rootPath);
  });

  /**
   * "Is this the right folder?" — four things are this feature's contract.
   *
   * (1) The inference performs **no new filesystem walk** — one measurement on
   * the vault root. (2) Confirming **skips the folder picker**. (3) The
   * evidence is measured, not asserted. (4) When it cannot measure it stays
   * quiet: no greyed-out button, just the plain folder picker.
   */
  const vaultRootPath = "/private/work/music/docs/ontology";

  it("proposes the enclosing repository from one vault-root probe", async () => {
    const vault = createFakeVaultHandle();
    const inspect = vi.fn(async () => inspection);
    const sourceRuntime = runtime({ inspect, rootPathOf: () => vaultRootPath });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));

    await waitFor(() => expect(result.current.proposedRoot).not.toBeNull());
    // The vault root only — no folder scan to hunt for candidates.
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith(vaultRootPath);
    expect(result.current.proposedRoot).toEqual({
      rootPath: inspection.rootPath,
      marker: "enclosing_git_repository",
      confidence: "high",
      // The evidence is a measurement, not a claim: 1 declared path was really there.
      witnessSummary: { total: 1, supported: 1, missing: 0 },
    });
  });

  it("confirms the proposed root without opening the picker", async () => {
    const vault = createFakeVaultHandle();
    const pickRoot = vi.fn(async () => inspection.rootPath);
    const sourceRuntime = runtime({ pickRoot, rootPathOf: () => vaultRootPath });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));
    await waitFor(() => expect(result.current.proposedRoot).not.toBeNull());
    const proposed = result.current.proposedRoot!.rootPath;

    await act(async () => { await result.current.runNextAction({ rootPath: proposed }); });

    expect(pickRoot).not.toHaveBeenCalled();
    expect(result.current.view).toMatchObject({
      status: "verified_current",
      currentness: "current",
      bindingCardinality: 1,
    });
    expect(vault.files.get(".ontology-atlas/project-sources.json") ?? "").toContain(proposed);
    // Confirming removes the question — the ask and the answer never share a spot.
    expect(result.current.proposedRoot).toBeNull();
  });

  it("holds the prescription until the inference settles", async () => {
    const vault = createFakeVaultHandle();
    let release: (() => void) | null = null;
    const inspect = vi.fn(
      () => new Promise<ProjectSourceInspection | null>((resolve) => {
        release = () => resolve(inspection);
      }),
    );
    const sourceRuntime = runtime({ inspect, rootPathOf: () => vaultRootPath });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));

    await waitFor(() => expect(inspect).toHaveBeenCalled());
    // What to prescribe is still unknown — "pick a folder" or "is this the right
    // folder?". Drawing now means the button in that spot swaps its label and
    // skin 300 ms later.
    expect(result.current.proposalSettled).toBe(false);

    await act(async () => { release?.(); });
    await waitFor(() => expect(result.current.proposalSettled).toBe(true));
    expect(result.current.proposedRoot?.rootPath).toBe(inspection.rootPath);
  });

  it("stays silent when the vault has no enclosing repository", async () => {
    const vault = createFakeVaultHandle();
    const inspect = vi.fn(async () => ({ ...inspection, kind: "folder" as const }));
    const sourceRuntime = runtime({ inspect, rootPathOf: () => vaultRootPath });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));

    await waitFor(() => expect(inspect).toHaveBeenCalledWith(vaultRootPath));
    await waitFor(() => expect(result.current.canRunSourceAction).toBe(true));
    expect(result.current.proposedRoot).toBeNull();
  });

  it("stays silent when the declared paths do not land in the candidate", async () => {
    const vault = createFakeVaultHandle();
    const inspect = vi.fn(async () => ({ ...inspection, files: ["README.md"] }));
    const sourceRuntime = runtime({ inspect, rootPathOf: () => vaultRootPath });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));

    await waitFor(() => expect(inspect).toHaveBeenCalledWith(vaultRootPath));
    await waitFor(() => expect(result.current.canRunSourceAction).toBe(true));
    // 0 of 1 declared path → low confidence. A guess that may be wrong is never
    // sold as a confirm button.
    expect(result.current.proposedRoot).toBeNull();
  });

  it("degrades honestly on web without probing a private root", async () => {
    const vault = createFakeVaultHandle();
    const inspect = vi.fn(async () => inspection);
    const sourceRuntime = runtime({ available: () => false, inspect });
    const { result } = renderHook(() => useProjectSourceModel({
      projectSlug: "music",
      vaultHandle: vault.handle,
      nodes,
      docs,
      runtime: sourceRuntime,
    }));

    await waitFor(() => expect(result.current.view?.status).toBe("not_measured"));
    expect(result.current.runtimeAvailable).toBe(false);
    expect(result.current.canRunSourceAction).toBe(false);
    expect(inspect).not.toHaveBeenCalled();
    // A surface that cannot measure **does not even wait** — the degraded notice
    // is there on the first frame.
    expect(result.current.proposalSettled).toBe(true);
    expect(result.current.proposedRoot).toBeNull();
  });
});
