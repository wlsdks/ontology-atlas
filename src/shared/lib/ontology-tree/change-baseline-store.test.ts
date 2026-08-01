import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  clearChangeBaseline,
  getChangeBaseline,
  getChangeBaselineScope,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
  useChangeBaseline,
} from "./change-baseline-store";

function node(id: string): KnowledgeGraphNode {
  return { id, title: id, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}
const nodes = [node("a"), node("b")];
const edges: KnowledgeGraphEdge[] = [];

/**
 * baseline 은 **어느 볼트의 것인지 알 때만** 저장/복원된다(fail closed). 그래서
 * 모든 시험이 먼저 볼트를 알린다 — 그러지 않으면 `markChangeBaseline` 이
 * 메모리에만 남고 아무 키도 안 쓴다.
 */
const VAULT_A = "local:alpha";
const VAULT_B = "local:bravo";
const keyFor = (scope: string) => `demo:change-baseline:v1:${scope}`;

beforeEach(() => {
  setChangeBaselineScope(VAULT_A);
});

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

  it("mark → localStorage 에 영속 (키에 볼트가 들어간다)", () => {
    markChangeBaseline(nodes, edges, 77);
    expect(window.localStorage.getItem(keyFor(VAULT_A))).not.toBeNull();
    // 볼트를 모르던 시절의 전역 키는 더 이상 쓰지 않는다.
    expect(window.localStorage.getItem("demo:change-baseline:v1")).toBeNull();
  });

  it("clear → 영속 제거", () => {
    markChangeBaseline(nodes, edges, 1);
    clearChangeBaseline();
    expect(window.localStorage.getItem(keyFor(VAULT_A))).toBeNull();
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
  const scope = getChangeBaselineScope() ?? VAULT_A;
  const saved = window.localStorage.getItem(keyFor(scope));
  clearChangeBaseline(); // in-mem null + 영속 제거
  if (saved !== null) window.localStorage.setItem(keyFor(scope), saved); // 영속 복구(reload 후 상태)
}

/**
 * **볼트를 바꾸면 앞 볼트의 기준이 이 볼트의 판정에 쓰이지 않는다** (2026-08-01
 * 신설). 이게 없으면 「자리 비운 사이 N개 바뀜」의 N 이 **새 볼트 전체**가
 * 된다 — 화면이 아무 일도 없었던 폴더에 대해 대규모 변경을 보고한다.
 *
 * 겹침 가드(`snapshotMatchesGraph`)로는 못 막는다. 그건 **복원 시점에만** 도는데,
 * 세션 중 전환은 복원을 거치지 않는다.
 */
describe("change-baseline-store — 볼트 전환 (범위를 넘긴 상태)", () => {
  const bravoNodes = [node("x"), node("y")];

  it("범위가 바뀌면 앞 볼트의 기준을 즉시 버린다", () => {
    markChangeBaseline(nodes, edges, 42);
    expect(getChangeBaseline()?.takenAt).toBe(42);

    setChangeBaselineScope(VAULT_B);

    expect(getChangeBaseline()).toBeNull();
  });

  it("볼트마다 자기 자리에 저장된다 — 새 볼트가 앞 볼트의 기준을 덮지 않는다", () => {
    markChangeBaseline(nodes, edges, 42);
    setChangeBaselineScope(VAULT_B);
    markChangeBaseline(bravoNodes, edges, 99);

    expect(window.localStorage.getItem(keyFor(VAULT_A))).not.toBeNull();
    expect(window.localStorage.getItem(keyFor(VAULT_B))).not.toBeNull();

    // A 로 돌아오면 A 의 기준이 그대로 복원된다.
    setChangeBaselineScope(VAULT_A);
    expect(restorePersistedBaseline(nodes)).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("볼트를 모르면 아무것도 저장하지 않는다 — 어느 볼트 것인지 모르는 기준은 거짓 판정의 입력", () => {
    // 이 시험은 범위를 못 알린 상태를 직접 만들 수 없으므로(모듈 싱글턴),
    // 대신 fail-closed 계약을 복원 쪽에서 확인한다: 저장된 자리가 없으면 false.
    setChangeBaselineScope(VAULT_B);
    expect(restorePersistedBaseline(bravoNodes)).toBe(false);
  });
});

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
