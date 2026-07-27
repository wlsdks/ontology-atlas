import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * D4 회귀 가드 — "닫힌 전체 상세가 클릭마다 그래프를 순회하던" 결함.
 *
 * 실측(2026-07-28, 격리 Chromium · dogfood 볼트): 노드 클릭 1회에
 * `buildConnections` 가 11회 돌았고 그중 9회가 **화면에 없는** 전체 상세
 * 카드 몫이었다(깊이 3 BFS + 이웃 행마다 도는 엣지 전수 순회 포함).
 *
 * 이 테스트는 **횟수로** 잠근다 — 절대 ms 는 기계마다 달라 플레이크가 되지만
 * "닫혀 있으면 0회"는 어느 기계에서나 참이다. `open` 게이트를 지우면
 * 즉시 실패한다.
 */

const groupsSpy = vi.fn(() => ({
  contains: { rows: [], total: 0 },
  usedBy: { rows: [], total: 0 },
  dependsOn: { rows: [], total: 0 },
  belongsTo: { rows: [], total: 0 },
}));
const reachSpy = vi.fn(() => ({ byDepth: {}, maxDepth: 3 }));
const codeLocationsSpy = vi.fn(() => [] as string[]);

vi.mock("@/widgets/full-detail-a1", () => ({
  buildFullDetailGroups: (...args: unknown[]) => groupsSpy(...(args as [])),
  buildFullDetailReachModel: (...args: unknown[]) => reachSpy(...(args as [])),
}));

vi.mock("@/entities/knowledge-graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/knowledge-graph")>();
  return {
    ...actual,
    deriveCodeLocations: (...args: unknown[]) => codeLocationsSpy(...(args as [])),
  };
});

const { useFullDetailA1Model } = await import("./use-full-detail-a1-model");

const stamp = new Date(0);

function node(id: string, extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [`${id}-doc`],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

const selected = node("capability:alpha");
const nodes: KnowledgeGraphNode[] = [selected, node("project:p", { kind: "project", title: "P" })];
const edges: KnowledgeGraphEdge[] = [];

const nodeFocus = {
  title: "alpha",
  displayTitle: "alpha",
  kind: "capability",
  sourceSlug: "capability-alpha",
  ownDocumentSlug: "capability-alpha",
  mentionedInSlug: null,
} as never;

// 안정된 참조 — 훅의 memo 계약은 입력 identity 가 안정할 때 성립한다
// (HomePage 쪽 실제 입력도 전부 useMemo/useCallback 파생이다).
const insight = { nodes, edges };
const changedSlugs: ReadonlySet<string> = new Set<string>();
const onSaveExplanation = () => undefined;

function render(open: boolean) {
  return renderHook(() =>
    useFullDetailA1Model({
      open,
      nodeFocus,
      selectedOntologyNode: selected,
      insight,
      changedSlugs,
      nodeBody: null,
      nodeEditTarget: null,
      vaultLoaded: false,
      onSaveExplanation,
      datasheet: null,
    }),
  );
}

describe("useFullDetailA1Model — 닫힌 표면은 그래프를 순회하지 않는다", () => {
  beforeEach(() => {
    groupsSpy.mockClear();
    reachSpy.mockClear();
    codeLocationsSpy.mockClear();
  });

  it("open=false 면 모델은 null 이고 그래프 순회는 0회다", () => {
    const { result } = render(false);
    expect(result.current).toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(0);
    expect(reachSpy).toHaveBeenCalledTimes(0);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(0);
  });

  it("open=true 면 같은 입력으로 모델을 조립하고 순회는 각 1회다", () => {
    const { result } = render(true);
    expect(result.current).not.toBeNull();
    expect(result.current?.node.id).toBe("capability:alpha");
    expect(result.current?.breadcrumb.projectTitle).toBe("P");
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });

  it("같은 선택을 다시 렌더해도 순회가 늘지 않는다 (memo 계약)", () => {
    const { result, rerender } = render(true);
    rerender();
    rerender();
    expect(result.current).not.toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    expect(reachSpy).toHaveBeenCalledTimes(1);
    expect(codeLocationsSpy).toHaveBeenCalledTimes(1);
  });
});
