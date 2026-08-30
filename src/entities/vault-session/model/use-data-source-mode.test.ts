import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultManifest } from "@/entities/docs-vault";
import { useDataSourceMode } from "./use-data-source-mode";

const mocks = vi.hoisted(() => ({
  vault: {
    status: "idle",
    manifest: null as VaultManifest | null,
  },
}));

vi.mock("./LocalVaultProvider", () => ({
  useLocalVault: () => mocks.vault,
}));

const manifest = {
  version: "1",
  generatedAt: "2026-07-25T00:00:00.000Z",
  docs: [],
  backlinksDetail: {},
  tags: {},
  tree: { name: "vault", path: "", type: "dir", children: [] },
} satisfies VaultManifest;

describe("useDataSourceMode", () => {
  beforeEach(() => {
    mocks.vault.status = "idle";
    mocks.vault.manifest = null;
  });

  it("검증된 manifest를 보존한 transient loading은 local mode를 유지한다", () => {
    mocks.vault.status = "loading";
    mocks.vault.manifest = manifest;

    const { result } = renderHook(() => useDataSourceMode());

    expect(result.current).toBe("local");
  });

  it("manifest 없는 첫 loading은 static sample을 유지한다", () => {
    mocks.vault.status = "loading";

    const { result } = renderHook(() => useDataSourceMode());

    expect(result.current).toBe("static");
  });
});
