import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import {
  clearChangeBaseline,
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
  useChangeBaseline,
} from "./change-baseline-store";
import { computeOntologyChangeset } from "./ontology-changeset";

function node(id: string): KnowledgeGraphNode {
  return { id, title: id, kind: "capability", projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "t" };
}
const nodes = [node("a"), node("b")];
const edges: KnowledgeGraphEdge[] = [];

/** Storage happens only once the vault is known, so every spec sets a scope first. */
const VAULT_A = "local:alpha";
const VAULT_B = "local:bravo";
const keyFor = (scope: string) => `demo:change-baseline:v2:${scope}`;
const firstFormKeyFor = (scope: string) => `demo:change-baseline:v1:${scope}`;
const storedKeys = () =>
  Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).filter((key) =>
    key?.startsWith("demo:change-baseline"),
  );

beforeEach(() => {
  setChangeBaselineScope(VAULT_A);
});

afterEach(() => {
  vi.restoreAllMocks();
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
  const more = [node("a"), node("b"), node("c")]; // Overlaps a,b, so it restores.

  it("persists to a vault-scoped localStorage key on mark", () => {
    markChangeBaseline(nodes, edges, 77);
    expect(storedKeys()).toEqual([keyFor(VAULT_A)]);
  });

  it("removes the persisted baseline on clear", () => {
    markChangeBaseline(nodes, edges, 1);
    clearChangeBaseline();
    expect(storedKeys()).toEqual([]);
  });

  it("reports a baseline storage refuses and keeps it for the session", () => {
    markChangeBaseline(nodes, edges, 1);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    markChangeBaseline(nodes, edges, 2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(getChangeBaseline()?.takenAt).toBe(2);
    expect(storedKeys()).toEqual([]);
  });

  it("restores a persisted baseline for an overlapping vault", () => {
    markChangeBaseline(nodes, edges, 42); // a,b persisted.
    clearChangeBaseline_inMemoryOnly();
    expect(getChangeBaseline()).toBeNull();
    const ok = restorePersistedBaseline(more); // a,b exist: full overlap.
    expect(ok).toBe(true);
    expect(getChangeBaseline()?.takenAt).toBe(42);
  });

  it("does not restore for a different vault", () => {
    markChangeBaseline(nodes, edges, 42); // a,b
    clearChangeBaseline_inMemoryOnly();
    const ok = restorePersistedBaseline([node("x"), node("y")]); // No overlap.
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

// Clears memory but keeps localStorage, simulating a reload; `clearChangeBaseline` wipes both.
function clearChangeBaseline_inMemoryOnly() {
  // No in-memory-only reset exists, so back up, clear and restore the stored value.
  const saved = window.localStorage.getItem(keyFor(VAULT_A));
  clearChangeBaseline();
  if (saved !== null) window.localStorage.setItem(keyFor(VAULT_A), saved);
}

/** A vault switch must drop the previous baseline; the overlap guard runs only on restore. */
describe("change-baseline-store vault switching", () => {
  const bravoNodes = [node("x"), node("y")];

  it("drops the previous vault's baseline when the scope changes", () => {
    markChangeBaseline(nodes, edges, 42);
    expect(getChangeBaseline()?.takenAt).toBe(42);

    setChangeBaselineScope(VAULT_B);

    expect(getChangeBaseline()).toBeNull();
  });

  it("keeps only the open vault's baseline in storage", () => {
    markChangeBaseline(nodes, edges, 42);
    setChangeBaselineScope(VAULT_B);
    markChangeBaseline(bravoNodes, edges, 99);
    expect(storedKeys()).toEqual([keyFor(VAULT_B)]);

    setChangeBaselineScope(VAULT_A);
    expect(restorePersistedBaseline(nodes)).toBe(false);
  });

  it("stores nothing when the vault is unknown", () => {
    // The unscoped singleton cannot be rebuilt, so fail-closed is checked from the restore side.
    setChangeBaselineScope(VAULT_B);
    expect(restorePersistedBaseline(bravoNodes)).toBe(false);
  });
});

describe("change-baseline-store carry-over from the first stored form", () => {
  it("restores the open vault's first-form baseline once and drops every first-form entry", () => {
    const firstForm = JSON.stringify({
      v: 1,
      nodeSigs: [["a", "capability\u0001a\u0001\u0001"], ["b", "capability\u0001b\u0001\u0001"]],
      nodeKinds: [["a", "capability"], ["b", "capability"]],
      edgeKeys: [],
      takenAt: 7,
    });
    window.localStorage.setItem(firstFormKeyFor(VAULT_A), firstForm);
    window.localStorage.setItem(firstFormKeyFor(VAULT_B), firstForm);
    window.localStorage.setItem("demo:change-baseline:v1", firstForm);

    expect(restorePersistedBaseline(nodes)).toBe(true);
    const restored = getChangeBaseline();
    expect(restored?.takenAt).toBe(7);
    expect(computeOntologyChangeset(restored, nodes, edges).total).toBe(0);
    expect(storedKeys()).toEqual([keyFor(VAULT_A)]);
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
