import { describe, expect, it, vi } from "vitest";
import {
  DOGFOOD_VAULT_PATH,
  DOGFOOD_VAULT_PATH_CANDIDATES,
  resolveDogfoodVaultPath,
} from "./dogfood-vault-path";

describe("resolveDogfoodVaultPath", () => {
  it("prefers the renamed ontology-atlas checkout when it exists", async () => {
    const exists = vi.fn(async (path: string) => path === DOGFOOD_VAULT_PATH);

    await expect(resolveDogfoodVaultPath(exists)).resolves.toBe(DOGFOOD_VAULT_PATH);

    expect(exists).toHaveBeenCalledWith(DOGFOOD_VAULT_PATH);
  });

  it("falls back to the current old checkout path while the folder has not been renamed yet", async () => {
    const oldCheckoutPath = "/Users/jinan/side-project/oh-my-ontology/docs/ontology";
    const exists = vi.fn(async (path: string) => path === oldCheckoutPath);

    await expect(resolveDogfoodVaultPath(exists)).resolves.toBe(oldCheckoutPath);

    expect(DOGFOOD_VAULT_PATH_CANDIDATES).toContain(oldCheckoutPath);
  });

  it("returns the preferred path when no candidate can be proven from the runtime", async () => {
    await expect(resolveDogfoodVaultPath(async () => false)).resolves.toBe(DOGFOOD_VAULT_PATH);
  });
});
