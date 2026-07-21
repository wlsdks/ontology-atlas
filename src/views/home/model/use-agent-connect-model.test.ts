import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAgentConnectModel } from "./use-agent-connect-model";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

vi.mock("@/shared/lib/tauri-vault-fs", () => ({
  getTauriVaultRootPath: () => null,
}));

const node = (id: string, kind: string, slug: string, title: string): KnowledgeGraphNode =>
  ({ id, kind, title, evidenceIds: [slug], projectIds: [] }) as unknown as KnowledgeGraphNode;

const heartbeat = (over: Record<string, unknown> = {}) => ({
  valid: true,
  stale: false,
  heartbeat: {
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    agent: "claude-code",
    focus: { ontologySlug: "capabilities/mcp-server" },
    ...over,
  },
});

describe("useAgentConnectModel (HomePage 모듈화 2차)", () => {
  it("heartbeat 없음/무효 → none", () => {
    const { result } = renderHook(() =>
      useAgentConnectModel({
        agentActivityStatus: null,
        vaultHandle: null,
        insightNodes: null,
        defaultAgentLabel: "에이전트",
      }),
    );
    expect(result.current.status).toEqual({ kind: "none" });
    expect(result.current.snippets.needsManualPath).toBe(true);
  });

  it("openSheet 가 now 스냅샷을 찍고 connected 상태가 focus 제목을 되말한다", () => {
    const nodes = [node("capability:mcp-server", "capability", "capabilities/mcp-server", "MCP Server")];
    const { result } = renderHook(() =>
      useAgentConnectModel({
        agentActivityStatus: heartbeat(),
        vaultHandle: null,
        insightNodes: nodes,
        defaultAgentLabel: "에이전트",
      }),
    );
    act(() => result.current.openSheet());
    expect(result.current.open).toBe(true);
    expect(result.current.status).toMatchObject({
      kind: "connected",
      agentLabel: "claude-code",
      focusTitle: "MCP Server",
    });
    act(() => result.current.closeSheet());
    expect(result.current.open).toBe(false);
  });

  it("stale heartbeat → stale, 도메인 제목 목록은 insight 파생", () => {
    const nodes = [
      node("domain:views", "domain", "domains/views", "Views"),
      node("capability:c", "capability", "capabilities/c", "C"),
    ];
    const { result } = renderHook(() =>
      useAgentConnectModel({
        agentActivityStatus: { ...heartbeat(), stale: true },
        vaultHandle: null,
        insightNodes: nodes,
        defaultAgentLabel: "에이전트",
      }),
    );
    expect(result.current.status.kind).toBe("stale");
    expect(result.current.domainTitles).toEqual(["Views"]);
  });
});
