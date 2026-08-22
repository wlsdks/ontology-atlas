import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "static" as "static" | "local",
  vault: { status: "idle" as string, restoreAttempted: false },
}));

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => mocks.mode,
}));
vi.mock("@/features/docs-vault-local", () => ({
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
  it("모드가 아직 안 정해졌으면 띄우지 않는다 — 빈 화면 위에 카드가 뜬다", () => {
    expect(ready()).toBe(false);
  });

  it("샘플 지도로 정착하면 띄운다", () => {
    mocks.vault = { status: "idle", restoreAttempted: true };
    expect(ready()).toBe(true);
  });

  /**
   * Measured defect (2026-07-26): the old condition was `mode === 'static'`, so
   * choosing a folder switched to local mode and **the tour was never received at all** —
   * even though the map, INDEX, and datasheet the tour explains are the same screen in
   * both modes.
   */
  it("내 폴더를 골라 로드돼도 띄운다", () => {
    mocks.mode = "local";
    mocks.vault = { status: "loaded", restoreAttempted: true };
    expect(ready()).toBe(true);
  });

  it("폴더를 고르는 중(로드 전)에는 띄우지 않는다", () => {
    mocks.mode = "local";
    for (const status of ["idle", "loading", "error"]) {
      mocks.vault = { status, restoreAttempted: true };
      expect(ready(), status).toBe(false);
    }
  });
});
