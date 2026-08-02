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
  });
});
