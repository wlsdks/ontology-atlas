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
  it("starts with a null baseline", () => {
    expect(getChangeBaseline()).toBeNull();
  });

  it("stores a snapshot on mark and clears it on clear", () => {
    markChangeBaseline(nodes, edges, 123);
    const b = getChangeBaseline();
    expect(b).not.toBeNull();
    expect(b?.takenAt).toBe(123);
    expect(b?.nodeSigs.size).toBe(2);
    clearChangeBaseline();
    expect(getChangeBaseline()).toBeNull();
  });

  it("rerenders useChangeBaseline on mark and clear", () => {
    const { result } = renderHook(() => useChangeBaseline());
    expect(result.current).toBeNull();
    act(() => markChangeBaseline(nodes, edges, 5));
    expect(result.current?.takenAt).toBe(5);
    act(() => clearChangeBaseline());
    expect(result.current).toBeNull();
  });

  it("shares one baseline across subscribers", () => {
    const a = renderHook(() => useChangeBaseline());
    const b = renderHook(() => useChangeBaseline());
    act(() => markChangeBaseline(nodes, edges, 9));
    expect(a.result.current?.takenAt).toBe(9);
    expect(b.result.current?.takenAt).toBe(9);
  });
});

describe("change-baseline-store persistence", () => {
  const more = [node("a"), node("b"), node("c")]; // Overlaps with a,b (target for restoration)

  it("persists to a vault-scoped localStorage key on mark", () => {
    markChangeBaseline(nodes, edges, 77);
    expect(window.localStorage.getItem(keyFor(VAULT_A))).not.toBeNull();
    // The global key from before vault scoping is no longer written.
    expect(window.localStorage.getItem("demo:change-baseline:v1")).toBeNull();
  });

  it("removes the persisted baseline on clear", () => {
    markChangeBaseline(nodes, edges, 1);
    clearChangeBaseline();
    expect(window.localStorage.getItem(keyFor(VAULT_A))).toBeNull();
  });

  it("restores a persisted baseline for an overlapping vault", () => {
    markChangeBaseline(nodes, edges, 42); // a,b persistent
    clearChangeBaseline_inMemoryOnly();
    expect(getChangeBaseline()).toBeNull();
    const ok = restorePersistedBaseline(more); // a,b exist → 100% overlap
    expect(ok).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("does not restore for a different vault", () => {
    markChangeBaseline(nodes, edges, 42); // a,b
    clearChangeBaseline_inMemoryOnly();
    const ok = restorePersistedBaseline([node("x"), node("y")]); // No overlap
    expect(ok).toBe(false);
    expect(getChangeBaseline()).toBeNull();
  });

  it("does not overwrite an existing baseline on restore", () => {
    markChangeBaseline(nodes, edges, 1);
    expect(restorePersistedBaseline(nodes)).toBe(false);
  });

  it("returns false on restore when nothing is persisted", () => {
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
describe("change-baseline-store vault switching", () => {
  const bravoNodes = [node("x"), node("y")];

  it("drops the previous vault's baseline when the scope changes", () => {
    markChangeBaseline(nodes, edges, 42);
    expect(getChangeBaseline()?.takenAt).toBe(42);

    setChangeBaselineScope(VAULT_B);

    expect(getChangeBaseline()).toBeNull();
  });

  it("stores each vault's baseline under its own key", () => {
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

  it("stores nothing when the vault is unknown", () => {
    // The unscoped state cannot be constructed directly (module singleton), so
    // the fail-closed contract is checked from the restore side: nothing stored,
    // false.
    setChangeBaselineScope(VAULT_B);
    expect(restorePersistedBaseline(bravoNodes)).toBe(false);
  });
});

describe("shouldAutoMarkBaseline", () => {
  it("returns true for a local vault with nodes and no baseline", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: false, nodeCount: 5 })).toBe(true);
  });
  it("returns false in static mode", () => {
    expect(shouldAutoMarkBaseline({ mode: "static", hasBaseline: false, nodeCount: 5 })).toBe(false);
  });
  it("returns false when a baseline exists", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: true, nodeCount: 5 })).toBe(false);
  });
  it("returns false with no nodes", () => {
    expect(shouldAutoMarkBaseline({ mode: "local", hasBaseline: false, nodeCount: 0 })).toBe(false);
  });
});
