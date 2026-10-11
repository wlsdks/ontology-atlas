import { describe, expect, it } from "vitest";

import { selectOpenVaultHandle } from "./select-open-vault-handle";

const handle = { name: "atlas" };

describe("selectOpenVaultHandle", () => {
  it("keeps the folder across a rescan of the same handle", () => {
    expect(selectOpenVaultHandle("loaded", handle)).toBe(handle);
    expect(selectOpenVaultHandle("loading", handle)).toBe(handle);
  });

  it("has no folder before one is chosen, or when access is lost", () => {
    for (const status of ["idle", "opening", "permission-needed", "unsupported", "error"]) {
      expect(selectOpenVaultHandle(status, handle)).toBeNull();
    }
    expect(selectOpenVaultHandle("loading", null)).toBeNull();
    expect(selectOpenVaultHandle("loaded", undefined)).toBeNull();
  });
});
