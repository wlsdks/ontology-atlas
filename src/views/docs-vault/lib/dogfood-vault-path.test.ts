import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The dogfood vault shortcut — **the path comes from build configuration.**
 *
 * **Why these tests changed** (2026-07-29). Two of the maintainer's home paths used to be constants
 * in the source, and this test held those values as its expectations. Those strings **shipped
 * verbatim in the public bundle** (verified live). The on-screen condition was narrow enough that
 * an ordinary visitor never saw them, but anyone opening the bundle reads them, and a macOS
 * username and directory structure ship together. That path also exists only on the maintainer's
 * machine, making it **dead code for the other 100% of users**.
 *
 * The value now comes from `NEXT_PUBLIC_DOGFOOD_VAULT_PATHS`, and this test measures **the rule
 * rather than the path**: how it parses, which candidate is chosen, and whether it quietly ceases
 * to exist when unconfigured (a public build).
 */

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

  /**
   * **This is the public build's case.** Unconfigured, there are zero candidates and the shortcut
   * quietly does not exist — more honest than pretending to open a path that is not there. And no
   * personal path ships in the bundle.
   */
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
