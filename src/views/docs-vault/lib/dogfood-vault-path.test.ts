import { afterEach, describe, expect, it, vi } from "vitest";

/** The dogfood path comes only from build configuration, so no personal path ships in the bundle. */

async function loadWith(paths: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DOGFOOD_VAULT_PATHS", paths ?? "");
  return import("./dogfood-vault-path");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("dogfood vault path config parsing", () => {
  it("takes comma-separated absolute paths as ordered candidates", async () => {
    const m = await loadWith("/a/docs/ontology,/b/docs/ontology");
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual(["/a/docs/ontology", "/b/docs/ontology"]);
    expect(m.DOGFOOD_VAULT_PATH).toBe("/a/docs/ontology");
    expect(m.hasDogfoodVaultPath()).toBe(true);
  });

  it("drops whitespace and empty entries", async () => {
    const m = await loadWith(" /a/docs/ontology , , /b/docs/ontology ");
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual(["/a/docs/ontology", "/b/docs/ontology"]);
  });

  /** The public build: no candidates, no shortcut. */
  it("has no candidates and no shortcut without config", async () => {
    const m = await loadWith(undefined);
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual([]);
    expect(m.DOGFOOD_VAULT_PATH).toBe("");
    expect(m.hasDogfoodVaultPath()).toBe(false);
  });
});

describe("resolveDogfoodVaultPath candidate choice", () => {
  it("picks the first candidate that exists at runtime", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    const exists = vi.fn(async (path: string) => path === "/old/docs/ontology");
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/old/docs/ontology");
    expect(exists).toHaveBeenCalledWith("/new/docs/ontology");
  });

  it("does not probe later candidates once one exists", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    const exists = vi.fn(async () => true);
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/new/docs/ontology");
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it("returns the first candidate when none is proven", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    await expect(m.resolveDogfoodVaultPath(async () => false)).resolves.toBe("/new/docs/ontology");
  });

  it("moves to the next candidate when the runtime probe throws", async () => {
    const m = await loadWith("/broken/docs/ontology,/ok/docs/ontology");
    const exists = vi.fn(async (path: string) => {
      if (path === "/broken/docs/ontology") throw new Error("probe failed");
      return true;
    });
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/ok/docs/ontology");
  });
});
