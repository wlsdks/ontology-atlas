import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "static" as "static" | "local",
  vault: { status: "idle" as string, restoreAttempted: false },
}));

vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => mocks.mode,
}));
vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => mocks.vault,
}));

import { useGuidedTourAutoStartReady } from "./use-auto-start-ready";

function ready(): boolean {
  return renderHook(() => useGuidedTourAutoStartReady()).result.current;
}

beforeEach(() => {
  mocks.mode = "static";
  mocks.vault = { status: "idle", restoreAttempted: false };
});

describe("useGuidedTourAutoStartReady", () => {
  it("is not ready while the mode is undecided", () => {
    expect(ready()).toBe(false);
  });

  it("is ready once the sample map settles", () => {
    mocks.vault = { status: "idle", restoreAttempted: true };
    expect(ready()).toBe(true);
  });

  /**
   * Measured defect (2026-07-26): the old condition was `mode === 'static'`, so
   * choosing a folder switched to local mode and **the tour was never received at all** —
   * even though the map, INDEX, and datasheet the tour explains are the same screen in
   * both modes.
   */
  it("is ready once a chosen folder loads", () => {
    mocks.mode = "local";
    mocks.vault = { status: "loaded", restoreAttempted: true };
    expect(ready()).toBe(true);
  });

  it("is not ready while a folder is being chosen", () => {
    mocks.mode = "local";
    for (const status of ["idle", "loading", "error"]) {
      mocks.vault = { status, restoreAttempted: true };
      expect(ready(), status).toBe(false);
    }
  });
});
