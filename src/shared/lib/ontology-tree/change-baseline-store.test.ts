import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  clearChangeBaseline,
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  shouldAutoMarkBaseline,
  useChangeBaseline,
} from "./change-baseline-store";

function node(id: string): KnowledgeGraphNode {
  return { id, title: id, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}
const nodes = [node("a"), node("b")];
const edges: KnowledgeGraphEdge[] = [];

afterEach(() => {
  clearChangeBaseline();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

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

describe("change-baseline-store — 영속/복원 (reload 생존, Self-Drawing Diff #5)", () => {
  const more = [node("a"), node("b"), node("c")]; // a,b 와 겹침(복원 대상)

  it("mark → localStorage 에 영속", () => {
    markChangeBaseline(nodes, edges, 77);
    expect(window.localStorage.getItem("demo:change-baseline:v1")).not.toBeNull();
  });

  it("clear → 영속 제거", () => {
    markChangeBaseline(nodes, edges, 1);
    clearChangeBaseline();
    expect(window.localStorage.getItem("demo:change-baseline:v1")).toBeNull();
  });

  it("restore — 같은(겹치는) vault 면 영속 baseline 복원 + true", () => {
    markChangeBaseline(nodes, edges, 42); // a,b 영속
    clearChangeBaseline_inMemoryOnly();
    expect(getChangeBaseline()).toBeNull();
    const ok = restorePersistedBaseline(more); // a,b 존재 → 겹침 100%
    expect(ok).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("restore — 다른 vault(안 겹침)면 복원 안 함 + false (garbage 방지)", () => {
    markChangeBaseline(nodes, edges, 42); // a,b
    clearChangeBaseline_inMemoryOnly();
    const ok = restorePersistedBaseline([node("x"), node("y")]); // 안 겹침
    expect(ok).toBe(false);
    expect(getChangeBaseline()).toBeNull();
  });

  it("restore — 이미 baseline 있으면 복원 안 함(덮어쓰기 방지)", () => {
    markChangeBaseline(nodes, edges, 1);
    expect(restorePersistedBaseline(nodes)).toBe(false);
  });

  it("restore — 영속된 게 없으면 false", () => {
    expect(restorePersistedBaseline(nodes)).toBe(false);
  });
});

// 테스트 헬퍼 — in-memory baseline 만 비우고 localStorage 는 보존(reload 시뮬).
// clearChangeBaseline 은 영속도 지우므로 복원 테스트엔 부적합.
function clearChangeBaseline_inMemoryOnly() {
  // mark 직후 localStorage 값을 백업했다 복구하는 대신, 직접 store 의 in-memory
  // 만 비우는 경로가 없으므로 localStorage 를 백업→clear(in-mem)→복구.
  const saved = window.localStorage.getItem("demo:change-baseline:v1");
  clearChangeBaseline(); // in-mem null + 영속 제거
  if (saved !== null) window.localStorage.setItem("demo:change-baseline:v1", saved); // 영속 복구(reload 후 상태)
}

describe("shouldAutoMarkBaseline (live-web 자동 baseline)", () => {
  it("local + baseline 없음 + 노드>0 → true", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: false, nodeCount: 5 })).toBe(true);
  });
  it("static 모드 → false (dogfood 는 안 변함)", () => {
    expect(shouldAutoMarkBaseline({ mode: "static", hasBaseline: false, nodeCount: 5 })).toBe(false);
  });
  it("이미 baseline 있음 → false (재설정 안 함)", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: true, nodeCount: 5 })).toBe(false);
  });
  it("노드 0 → false (빈 vault 에 의미 없음)", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: false, nodeCount: 0 })).toBe(false);
  });
});
