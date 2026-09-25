import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/*
 * The authoring hook's two writes that the map-edit QA pass (2026-09-26) found saying the
 * wrong thing: the body editor's refusal (D3) and the domain a "create under this domain"
 * node is filed under (D10). The heavy collaborators are stubbed; what is asserted is the
 * sentence a refusal raises and the value a new node's `domain:` is built from.
 */
vi.mock("./use-agent-connect-model", () => ({ useAgentConnectModel: () => ({}) }));
vi.mock("./use-bootstrap-flow", () => ({
  useBootstrapFlow: () => ({
    bootstrapOpen: false,
    setBootstrapOpen: vi.fn(),
    bootstrapPlan: null,
    runBootstrap: vi.fn(),
  }),
}));
vi.mock("./use-topology-edge-interactions", () => ({
  useTopologyEdgeInteractions: () => ({
    selectedEdge: null,
    setSelectedEdge: vi.fn(),
    edgePanelModel: null,
    edgePanelOpen: false,
    heldEdgePanelModel: null,
    setHoverEdge: vi.fn(),
    handleHoverEdge: vi.fn(),
    hoverEdgeCardModel: null,
    handleHoverCluster: vi.fn(),
    clusterHoverCardModel: null,
  }),
}));
vi.mock("@/entities/vault-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session")>()),
  useAgentServer: () => ({ status: "unavailable" }),
}));

import { VaultConflictError } from "@/entities/vault-session";
import { useTopologyAuthoring } from "./use-topology-authoring";

const RAW = "---\nslug: capabilities/doctor\nkind: capability\ntitle: Doctor\n---\n\nOld body.\n";

function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "capability:doctor",
    kind: "capability",
    title: "Doctor",
    evidenceIds: ["capabilities/doctor"],
    ...overrides,
  } as KnowledgeGraphNode;
}

function renderAuthoring(saveDoc: (...args: unknown[]) => Promise<void>) {
  const toast = { show: vi.fn(), dismiss: vi.fn() };
  const fileHandle = {
    getFile: async () => ({ text: async () => RAW, lastModified: 1000 }),
  } as unknown as FileSystemFileHandle;
  const manifest = {
    version: "1",
    generatedAt: "",
    docs: [{ slug: "capabilities/doctor", mtime: 1000, frontmatter: { kind: "capability" } }],
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir" as const },
  };
  const doctor = node({});
  const domainNode = node({
    id: "domain:agent-access",
    kind: "domain",
    title: "Agent access",
    evidenceIds: ["domains/agent-access"],
  });
  // Built once: the hook's effects key on these identities, as the real read model's are stable.
  const options = {
    setRouteState: vi.fn(),
    meaningEditorIntent: false,
    meaningEditParam: null,
    toast,
    topologyPreferences: {
      reducedMotion: true,
      t: ((key: string) => key) as never,
      tMeaningEditor: ((key: string) => key) as never,
      relationVocabulary: (() => "") as never,
      relationRegister: "plain" as never,
    },
    topologyVaultReadModel: {
      selectedOntologyNode: doctor,
      vault: {
        manifest,
        fileHandles: new Map([["capabilities/doctor", fileHandle]]),
        saveDoc,
        status: "loaded",
        agentActivityStatus: null,
      } as never,
      ontologyInsight: { nodes: [doctor, domainNode], edges: [] } as never,
      setNeedsVaultReason: vi.fn(),
      recentChanges: { recentNodeIds: new Set<string>() } as never,
      docFreshnessIndex: new Map(),
      updatedAgoNowMs: 0,
    },
  };
  const hook = renderHook(() => useTopologyAuthoring(options));
  return { ...hook, toast };
}

describe("useTopologyAuthoring — the body editor's refusal (D3)", () => {
  it("names a conflict as a conflict and rejects, so the editor keeps the draft", async () => {
    const saveDoc = vi.fn(async () => {
      throw new VaultConflictError("capabilities/doctor", 1000, 2000);
    });
    const { result, toast } = renderAuthoring(saveDoc);
    await waitFor(() => expect(result.current.nodeBody?.slug).toBe("capabilities/doctor"));

    await expect(
      act(async () => {
        await result.current.saveNodeExplanation("My draft.");
      }),
    ).rejects.toBeInstanceOf(VaultConflictError);
    expect(toast.show).toHaveBeenCalledWith("explanationEdit.conflict", "error");
    expect(toast.show).not.toHaveBeenCalledWith("explanationEdit.error", "error");
  });

  it("keeps the generic sentence for a failure that is not a conflict", async () => {
    const saveDoc = vi.fn(async () => {
      throw new Error("disk full");
    });
    const { result, toast } = renderAuthoring(saveDoc);
    await waitFor(() => expect(result.current.nodeBody?.slug).toBe("capabilities/doctor"));

    await expect(
      act(async () => {
        await result.current.saveNodeExplanation("My draft.");
      }),
    ).rejects.toThrow("disk full");
    expect(toast.show).toHaveBeenCalledWith("explanationEdit.error", "error");
  });
});

describe("useTopologyAuthoring — the domain a new concept is filed under (D10)", () => {
  it("offers each domain by its own address, the spelling every agent-written node uses", () => {
    const { result } = renderAuthoring(vi.fn());
    expect(result.current.createNodeDomainOptions).toEqual([
      { value: "domains/agent-access", label: "Agent access" },
    ]);
  });
});
