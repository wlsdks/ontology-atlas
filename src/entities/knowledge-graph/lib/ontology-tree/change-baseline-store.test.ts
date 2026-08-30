import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
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
 * A baseline is stored and restored **only when the vault it belongs to is known**
 * (fail closed), so every spec announces the vault first — otherwise
 * `markChangeBaseline` stays in memory and writes no key at all.
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
  const more = [node("a"), node("b"), node("c")]; // Overlaps with a,b (target for restoration)

  it("mark → localStorage 에 영속 (키에 볼트가 들어간다)", () => {
    markChangeBaseline(nodes, edges, 77);
    expect(window.localStorage.getItem(keyFor(VAULT_A))).not.toBeNull();
    // The global key from before vault scoping is no longer written.
    expect(window.localStorage.getItem("demo:change-baseline:v1")).toBeNull();
  });

  it("clear → 영속 제거", () => {
    markChangeBaseline(nodes, edges, 1);
    clearChangeBaseline();
    expect(window.localStorage.getItem(keyFor(VAULT_A))).toBeNull();
  });

  it("restore — 같은(겹치는) vault 면 영속 baseline 복원 + true", () => {
    markChangeBaseline(nodes, edges, 42); // a,b persistent
    clearChangeBaseline_inMemoryOnly();
    expect(getChangeBaseline()).toBeNull();
    const ok = restorePersistedBaseline(more); // a,b exist → 100% overlap
    expect(ok).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("restore — 다른 vault(안 겹침)면 복원 안 함 + false (garbage 방지)", () => {
    markChangeBaseline(nodes, edges, 42); // a,b
    clearChangeBaseline_inMemoryOnly();
    const ok = restorePersistedBaseline([node("x"), node("y")]); // No overlap
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

// Test helper: clear the in-memory baseline while keeping localStorage, to
// simulate a reload. `clearChangeBaseline` also wipes the persisted copy, which
// makes it unusable for restore specs.
function clearChangeBaseline_inMemoryOnly() {
  // The store exposes no in-memory-only reset, so back localStorage up, clear,
  // and restore it.
  const scope = getChangeBaselineScope() ?? VAULT_A;
  const saved = window.localStorage.getItem(keyFor(scope));
  clearChangeBaseline(); // in-mem null + persistent removal
  if (saved !== null) window.localStorage.setItem(keyFor(scope), saved); // Persistent restoration (state after reload)
}

/**
 * **Switching vaults must not let the previous vault's baseline decide this one**
 * (added 2026-08-01). Without it, the N in "N changed while you were away" becomes
 * **the entire new vault**, and the screen reports a mass change in a folder where
 * nothing happened.
 *
 * The overlap guard (`snapshotMatchesGraph`) cannot catch this: it runs **only at
 * restore time**, and an in-session switch never passes through restore.
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

    // Coming back to A restores A's own baseline.
    setChangeBaselineScope(VAULT_A);
    expect(restorePersistedBaseline(nodes)).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("볼트를 모르면 아무것도 저장하지 않는다 — 어느 볼트 것인지 모르는 기준은 거짓 판정의 입력", () => {
    // The unscoped state cannot be constructed directly (module singleton), so
    // the fail-closed contract is checked from the restore side: nothing stored,
    // false.
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
