import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import enMessages from "../../../../messages/en.json";
import { GlobalSearch } from "./GlobalSearch";

// cmdk (Command) + @tanstack/react-virtual 의 project chip row 가
// ResizeObserver 를 요구 — jsdom 엔 없어 최소 stub 필요.
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only jsdom polyfill
  (globalThis as any).ResizeObserver = ResizeObserverStub;
  // cmdk 가 활성 항목을 스크롤시키는 데 사용 — jsdom 엔 미구현.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(input: Partial<KnowledgeGraphNode> & { id: string; title: string }): KnowledgeGraphNode {
  return {
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
    ...input,
  };
}

function project(input: Partial<Project> & { slug: string; name: string }): Project {
  return {
    category: "frontend",
    status: "active",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    screenshots: [],
    timeline: { start: undefined, end: undefined } as Project["timeline"],
    position: { x: 0, y: 0 } as Project["position"],
    createdAt: new Date(),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    ...input,
  } as Project;
}

/** cmdk 옵션은 `data-value="ontology:<id>"` 로 마킹 — 매치 하이라이트(<mark>)가
 * title 텍스트를 여러 element 로 쪼개 getByText 매칭이 깨지므로, RTL 텍스트
 * 매칭 대신 이 안정적인 data 속성으로 옵션을 찾는다. */
function findOntologyOption(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[cmdk-item][data-value="ontology:${nodeId}"]`,
  );
}

/**
 * persona-P1 회귀 방지 — "MCP Server" 를 찾고, 골라서 지도를 벗어나지 않는
 * 흐름의 근본이 되는 두 계약을 이 컴포넌트 레벨에서 고정한다:
 *
 * 1. onSelectNode 콜백 — HomePage 는 이 콜백을 handleSelect(node.id) 로
 *    override 해서 지도 위에 머문다. 콜백 자체가 올바른 node 로 불리는지가
 *    그 override 가 의미를 가지는 전제조건.
 * 2. kind 필터 칩 — 예전 헤더 검색(SearchPalette)의 ALL/HUB/NODE 칩은
 *    ontology 노드를 전혀 다루지 않는 축이라 체감상 no-op 이었다. 이
 *    통합 팔레트(GlobalSearch)의 kind 칩이 실제로 결과를 좁히는지 고정.
 */
describe("GlobalSearch", () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server (24 tools)", kind: "capability" }),
    node({ id: "capability:mcp-conflict-guard", title: "MCP Conflict Guard", kind: "capability" }),
    node({ id: "element:mcp-index", title: "mcp/src/index.js", kind: "element" }),
    node({ id: "domain:ai-agent-partner", title: "AI Agent Partner", kind: "domain" }),
  ];
  const projects: Project[] = [project({ slug: "ontology-atlas", name: "ontology-atlas" })];

  it("검색 결과에 ontology 노드가 포함된다 (project/doc 만 있던 이전 헤더 팔레트와의 차이)", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), {
      target: { value: "mcp server" },
    });

    expect(findOntologyOption("capability:mcp-server")).not.toBeNull();
  });

  it("ontology 노드 결과를 고르면 onSelectNode 가 정확한 노드로 호출된다", () => {
    const onSelectNode = vi.fn();
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={onSelectNode}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), {
      target: { value: "mcp server" },
    });
    const option = findOntologyOption("capability:mcp-server");
    expect(option).not.toBeNull();
    fireEvent.click(option!);

    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode.mock.calls[0][0]).toMatchObject({ id: "capability:mcp-server" });
  });

  it("kind 필터 칩이 실제로 결과를 좁힌다 (no-op 회귀 방지)", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), {
      target: { value: "mcp" },
    });
    // 필터 없이는 capability 2건 + element 1건 모두 노출.
    expect(findOntologyOption("capability:mcp-server")).not.toBeNull();
    expect(findOntologyOption("capability:mcp-conflict-guard")).not.toBeNull();
    expect(findOntologyOption("element:mcp-index")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Element" }));

    // ELEMENT 칩 활성화 후 — capability 결과는 사라지고 element 만 남는다.
    expect(findOntologyOption("capability:mcp-server")).toBeNull();
    expect(findOntologyOption("capability:mcp-conflict-guard")).toBeNull();
    expect(findOntologyOption("element:mcp-index")).not.toBeNull();
  });

  it("N12 — 파일 경로 형태 element title 은 mono/quaternary 로 강등되고, 일반 title 은 그대로 primary", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Global search" }), {
      target: { value: "mcp" },
    });

    const pathLikeRow = findOntologyOption("element:mcp-index");
    expect(pathLikeRow?.querySelector('[data-search-result-path-like="true"]')).not.toBeNull();

    const plainRow = findOntologyOption("capability:mcp-server");
    expect(plainRow?.querySelector('[data-search-result-path-like="true"]')).toBeNull();
  });
});
