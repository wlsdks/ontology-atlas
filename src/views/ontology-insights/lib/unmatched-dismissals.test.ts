import { afterEach, describe, expect, it } from "vitest";

import {
  readUnmatchedDismissals,
  unmatchedDismissalKey,
  writeUnmatchedDismissals,
} from "./unmatched-dismissals";

afterEach(() => {
  window.localStorage.clear();
});

describe("unmatched dismissals — this viewer's, this vault's, this browser's", () => {
  it("keys the slot by vault under one named prefix", () => {
    // The literal is here on purpose: `tests/contract/scope-registry.contract.test.ts`
    // treats a test that never mentions the key as no proof at all.
    expect(unmatchedDismissalKey("vault-a")).toBe("atlas.insights.unmatchedDismissed:vault-a");
  });

  it("scopes the slot to the vault, so hiding a row here does not hide one there", () => {
    expect(unmatchedDismissalKey("vault-a")).not.toBe(unmatchedDismissalKey("vault-b"));
    writeUnmatchedDismissals("vault-a", new Set(["unresolved-reference:x"]));
    expect([...readUnmatchedDismissals("vault-a")]).toEqual(["unresolved-reference:x"]);
    expect([...readUnmatchedDismissals("vault-b")]).toEqual([]);
  });

  it("survives a reload of the same vault", () => {
    writeUnmatchedDismissals("v", new Set(["a", "b"]));
    expect([...readUnmatchedDismissals("v")].sort()).toEqual(["a", "b"]);
  });

  it("reads an empty set from an unwritten, corrupt, or wrongly shaped slot", () => {
    expect([...readUnmatchedDismissals("never-written")]).toEqual([]);
    window.localStorage.setItem(unmatchedDismissalKey("broken"), "{not json");
    expect([...readUnmatchedDismissals("broken")]).toEqual([]);
    window.localStorage.setItem(unmatchedDismissalKey("wrong"), '{"a":1}');
    expect([...readUnmatchedDismissals("wrong")]).toEqual([]);
  });

  it("keeps only strings — a slot someone else wrote cannot smuggle a row id in", () => {
    window.localStorage.setItem(unmatchedDismissalKey("mixed"), '["ok", 7, null]');
    expect([...readUnmatchedDismissals("mixed")]).toEqual(["ok"]);
  });

  it("clears the slot rather than storing an empty list", () => {
    writeUnmatchedDismissals("v", new Set(["a"]));
    writeUnmatchedDismissals("v", new Set());
    expect(window.localStorage.getItem(unmatchedDismissalKey("v"))).toBeNull();
  });

  it("refuses an empty vault scope — a slot with no vault is the global-key defect", () => {
    writeUnmatchedDismissals("", new Set(["a"]));
    expect([...readUnmatchedDismissals("")]).toEqual([]);
    expect(window.localStorage.length).toBe(0);
  });
});
