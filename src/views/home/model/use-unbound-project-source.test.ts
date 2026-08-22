import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { ProjectSourceStore } from "@/shared/lib/project-source-store";

import { useUnboundProjectSource } from "./use-unbound-project-source";

function node(id: string, kind: string, agentSlug?: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    agentSlug,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-08-01"),
    lastApprovedBy: "system",
  } as KnowledgeGraphNode;
}

const handle = {} as FileSystemDirectoryHandle;

function stubStore(
  result: Awaited<ReturnType<ProjectSourceStore["read"]>>,
  onRead?: () => void,
): ProjectSourceStore {
  return {
    read: async () => {
      onRead?.();
      return result;
    },
    list: async () => result,
    replaceAfterMeasurement: async () => {
      throw new Error("not used");
    },
  };
}

const NODES = [
  node("project:storefront", "project", "storefront"),
  node("domain:orders", "domain"),
];

describe("useUnboundProjectSource", () => {
  it("reports the project whose code folder was never connected", async () => {
    const { result } = renderHook(() =>
      useUnboundProjectSource({
        vaultHandle: handle,
        nodes: NODES,
        createStore: () => stubStore({ status: "missing", bindings: [] }),
      }),
    );
    await waitFor(() =>
      expect(result.current).toEqual({ nodeId: "project:storefront", count: 1 }),
    );
  });

  it("stays silent once that project has a binding", async () => {
    /*
     * ⚠️ Asserting only "it is null" also passes on the **first frame, before
     * any read** — a truth about the initial value, not about the product. So
     * the read is confirmed to have happened first, and null is asserted after.
     */
    let reads = 0;
    const { result } = renderHook(() =>
      useUnboundProjectSource({
        vaultHandle: handle,
        nodes: NODES,
        createStore: () =>
          stubStore({
            status: "ok",
            bindings: [
              {
                projectSlug: "storefront",
                sourceId: "git:abc",
                rootPath: "/Users/me/storefront",
                kind: "git",
                boundAt: "2026-08-01T00:00:00.000Z",
                receipt: null,
              } as never,
            ],
          }, () => { reads += 1; }),
      }),
    );
    await waitFor(() => expect(reads).toBe(1));
    expect(result.current).toBeNull();
  });

  /**
   * Failing to read the sidecar is a different fact from "there is no folder".
   * If the quiet line beside the map conflates them, the row starts lying.
   */
  it("does not claim 'no folder' when the sidecar itself is unreadable", async () => {
    const { result } = renderHook(() =>
      useUnboundProjectSource({
        vaultHandle: handle,
        nodes: NODES,
        createStore: () => stubStore({ status: "malformed", bindings: [] }),
      }),
    );
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("reads nothing at all before a vault is open", () => {
    const createStore = vi.fn(() => stubStore({ status: "missing", bindings: [] }));
    const { result } = renderHook(() =>
      useUnboundProjectSource({ vaultHandle: null, nodes: NODES, createStore }),
    );
    expect(createStore).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
