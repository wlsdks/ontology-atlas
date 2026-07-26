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
    expect(result.current.snippets.replacementMcpJson).toContain(
      '"OATLAS_VAULT": "."',
    );
    expect(result.current.snippets.codexConfig).toContain('OATLAS_VAULT = "."');
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

  // 감사 D5 — 한국어 화면인데 "연결되면 에이전트는 이렇게 읽어요" 미리보기가
  // 지도·INDEX 의 한글 이름 대신 영문 canonical title 을 되말했다.
  it("화면 언어로 부르는 이름이 있으면 미리보기도 그 이름을 쓴다", () => {
    const localized = (
      id: string,
      kind: string,
      slug: string,
      title: string,
      display: string,
    ) =>
      ({
        id,
        kind,
        title,
        display,
        evidenceIds: [slug],
        projectIds: [],
      }) as unknown as KnowledgeGraphNode;
    const nodes = [
      localized("domain:order", "domain", "domains/order", "Example domain", "예시 영역"),
      localized(
        "capability:mcp-server",
        "capability",
        "capabilities/mcp-server",
        "MCP Server",
        "엠시피 서버",
      ),
    ];
    const { result } = renderHook(() =>
      useAgentConnectModel({
        agentActivityStatus: heartbeat(),
        vaultHandle: null,
        insightNodes: nodes,
        defaultAgentLabel: "에이전트",
      }),
    );
    act(() => result.current.openSheet());
    expect(result.current.domainTitles).toEqual(["예시 영역"]);
    expect(
      result.current.status.kind === "connected" ? result.current.status.focusTitle : null,
    ).toBe("엠시피 서버");
  });
});
