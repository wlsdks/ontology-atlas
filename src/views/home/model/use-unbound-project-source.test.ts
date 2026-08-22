import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { ProjectSourceStore } from "@/shared/lib/project-source-store";

import {
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
     * ⚠️ 「null 이다」만 단언하면 **아직 안 읽은 첫 프레임**도 통과한다 — 그건
     * 제품에 대한 참이 아니라 초기값에 대한 참이다. 그래서 읽기가 실제로
     * 일어났다는 것을 먼저 확인하고, 그다음에 null 을 단언한다.
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
   * 사이드카를 못 읽는 것은 「폴더가 없다」와 다른 사실이다. 지도 옆 조용한 한
   * 줄이 그 둘을 뭉뚱그리면, 이 행이 곧바로 거짓말을 하기 시작한다.
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
