import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { ProjectSourceStore } from "@/shared/lib/project-source-store";
import type { AcpWorkReceipt } from "@/shared/lib/acp-work-receipt";
import { chatSuggestions } from "@/features/acp-session/model/chat-suggestions";

import {
  buildProjectSourceReadinessRefreshToken,
  useProjectSourceReadiness,
  useUnboundProjectSource,
} from "./use-unbound-project-source";

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

function sourceReceipt(
  result: AcpWorkReceipt["result"],
  updatedAt: string,
  tool = "connect_project_source",
): AcpWorkReceipt {
  return {
    v: 1,
    id: "source-binding-1",
    at: "2026-08-30T00:00:00.000Z",
    updatedAt,
    agent: "Codex",
    request: "Connect this project source",
    tool,
    decision: "allowed",
    result,
    items: [],
  };
}

describe("useUnboundProjectSource", () => {
  it("distinguishes loading, unbound, and bound so bootstrap cannot run early", async () => {
    let release: (value: Awaited<ReturnType<ProjectSourceStore["read"]>>) => void = () => undefined;
    const pending = new Promise<Awaited<ReturnType<ProjectSourceStore["read"]>>>((resolve) => {
      release = resolve;
    });
    const store = stubStore({ status: "missing", bindings: [] });
    store.read = () => pending;
    const { result } = renderHook(() =>
      useProjectSourceReadiness({
        vaultHandle: handle,
        nodes: NODES,
        createStore: () => store,
      }),
    );
    expect(result.current.state).toBe("loading");
    release({ status: "missing", bindings: [] });
    await waitFor(() => expect(result.current.state).toBe("unbound"));
    expect(result.current.unbound?.nodeId).toBe("project:storefront");
  });

  it("re-reads after the selected project finishes connecting its source", async () => {
    let connected = false;
    let releaseConnected: (
      value: Awaited<ReturnType<ProjectSourceStore["read"]>>,
    ) => void = () => undefined;
    const connectedRead = new Promise<Awaited<ReturnType<ProjectSourceStore["read"]>>>(
      (resolve) => {
        releaseConnected = resolve;
      },
    );
    const createStore = () => {
      const store = stubStore({ status: "missing", bindings: [] });
      if (connected) store.read = () => connectedRead;
      return store;
    };
    const beforeToken = buildProjectSourceReadinessRefreshToken({
      projectSlug: "storefront",
      bindingCardinality: 0,
      measuredAt: null,
      proposalSettled: false,
      acpWorkReceipts: [sourceReceipt("pending", "2026-08-30T00:00:01.000Z")],
    });
    const { result, rerender } = renderHook(
      ({ refreshToken }) => useProjectSourceReadiness({
        vaultHandle: handle,
        nodes: NODES,
        createStore,
        refreshToken,
      }),
      { initialProps: { refreshToken: beforeToken } },
    );
    await waitFor(() => expect(result.current.state).toBe("unbound"));
    expect(chatSuggestions({
      nodeCount: 5,
      islands: [],
      missingContainment: [],
      unevidenced: [],
      sourceState: result.current.state,
    }).map(({ kind }) => kind)).toEqual(["connectSource"]);

    connected = true;
    const afterToken = buildProjectSourceReadinessRefreshToken({
      projectSlug: "storefront",
      bindingCardinality: 0,
      measuredAt: null,
      proposalSettled: false,
      acpWorkReceipts: [sourceReceipt("completed", "2026-08-30T00:00:02.000Z")],
    });
    expect(afterToken).not.toBe(beforeToken);
    rerender({ refreshToken: afterToken });
    expect(result.current).toEqual({ state: "loading", unbound: null });
    releaseConnected({
      status: "ok",
      bindings: [{ projectSlug: "storefront" } as never],
    });
    await waitFor(() => expect(result.current.state).toBe("bound"));
    expect(chatSuggestions({
      nodeCount: 5,
      islands: [],
      missingContainment: [],
      unevidenced: [],
      sourceState: result.current.state,
    }).map(({ kind }) => kind)).toEqual(["bootstrap"]);
  });

  it("changes the refresh revision only for a completed source-binding receipt", () => {
    const base = {
      projectSlug: "storefront",
      bindingCardinality: 0,
      measuredAt: null,
      proposalSettled: false,
    };
    const withoutReceipt = buildProjectSourceReadinessRefreshToken({
      ...base,
      acpWorkReceipts: [],
    });
    expect(buildProjectSourceReadinessRefreshToken({
      ...base,
      acpWorkReceipts: [sourceReceipt("pending", "2026-08-30T00:00:01.000Z")],
    })).toBe(withoutReceipt);
    expect(buildProjectSourceReadinessRefreshToken({
      ...base,
      acpWorkReceipts: [sourceReceipt("completed", "2026-08-30T00:00:02.000Z", "add_concept")],
    })).toBe(withoutReceipt);
    expect(buildProjectSourceReadinessRefreshToken({
      ...base,
      acpWorkReceipts: [sourceReceipt("completed", "2026-08-30T00:00:03.000Z")],
    })).not.toBe(withoutReceipt);
  });

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

  it("does not reuse another vault's readiness when both vaults use the same project slug", async () => {
    const firstHandle = {} as FileSystemDirectoryHandle;
    const secondHandle = {} as FileSystemDirectoryHandle;
    let releaseSecond: (
      value: Awaited<ReturnType<ProjectSourceStore["read"]>>,
    ) => void = () => undefined;
    const secondRead = new Promise<Awaited<ReturnType<ProjectSourceStore["read"]>>>(
      (resolve) => {
        releaseSecond = resolve;
      },
    );
    const createStore = (currentHandle: FileSystemDirectoryHandle) => {
      if (currentHandle === firstHandle) {
        return stubStore({ status: "missing", bindings: [] });
      }
      const store = stubStore({ status: "ok", bindings: [] });
      store.read = () => secondRead;
      return store;
    };
    const { result, rerender } = renderHook(
      ({ vaultHandle }) => useProjectSourceReadiness({
        vaultHandle,
        nodes: NODES,
        createStore,
      }),
      { initialProps: { vaultHandle: firstHandle } },
    );
    await waitFor(() => expect(result.current.state).toBe("unbound"));

    rerender({ vaultHandle: secondHandle });
    expect(result.current).toEqual({ state: "loading", unbound: null });

    releaseSecond({
      status: "ok",
      bindings: [{ projectSlug: "storefront" } as never],
    });
    await waitFor(() => expect(result.current.state).toBe("bound"));
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
