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

vi.mock("../vault-provider/LocalVaultProvider", () => ({
  useLocalVault: () => mocks.vault,
}));

const manifest = {
  version: "1",
  generatedAt: "2026-07-25T00:00:00.000Z",
  docs: [],
  backlinkSources: {},
  tags: {},
  tree: { name: "vault", path: "", type: "dir", children: [] },
} satisfies VaultManifest;

describe("useDataSourceMode", () => {
  beforeEach(() => {
    mocks.vault.status = "idle";
    mocks.vault.manifest = null;
  });

  it("keeps local mode for a transient loading that preserved a verified manifest", () => {
    mocks.vault.status = "loading";
    mocks.vault.manifest = manifest;

    const { result } = renderHook(() => useDataSourceMode());

    expect(result.current).toBe("local");
  });

  it("keeps the static sample for a first loading with no manifest", () => {
    mocks.vault.status = "loading";

    const { result } = renderHook(() => useDataSourceMode());

    expect(result.current).toBe("static");
  });
});
