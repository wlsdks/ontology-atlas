import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  clearChangeBaseline,
  getChangeBaseline,
  markChangeBaseline,
  useChangeBaseline,
} from "./change-baseline-store";

function node(id: string): KnowledgeGraphNode {
  return { id, title: id, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}
const nodes = [node("a"), node("b")];
const edges: KnowledgeGraphEdge[] = [];

afterEach(() => clearChangeBaseline());

describe("change-baseline-store", () => {
  it("초기 baseline 은 null", () => {
    expect(getChangeBaseline()).toBeNull();
  });

  it("mark → 스냅샷 저장, clear → null", () => {
    markChangeBaseline(nodes, edges, 123);
    const b = getChangeBaseline();
    expect(b).not.toBeNull();
    expect(b?.takenAt).toBe(123);
    expect(b?.nodeSigs.size).toBe(2);
    clearChangeBaseline();
    expect(getChangeBaseline()).toBeNull();
  });

  it("useChangeBaseline 이 mark/clear 에 반응해 리렌더", () => {
    const { result } = renderHook(() => useChangeBaseline());
    expect(result.current).toBeNull();
    act(() => markChangeBaseline(nodes, edges, 5));
    expect(result.current?.takenAt).toBe(5);
    act(() => clearChangeBaseline());
    expect(result.current).toBeNull();
  });

  it("여러 구독자가 같은 baseline 을 공유한다 (cross-surface)", () => {
    const a = renderHook(() => useChangeBaseline());
    const b = renderHook(() => useChangeBaseline());
    act(() => markChangeBaseline(nodes, edges, 9));
    expect(a.result.current?.takenAt).toBe(9);
    expect(b.result.current?.takenAt).toBe(9);
  });
});
