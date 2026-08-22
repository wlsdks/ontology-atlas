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

describe("dogfood 볼트 경로 — 설정 파싱", () => {
  it("콤마로 나눈 절대 경로를 순서대로 후보로 삼는다", async () => {
    const m = await loadWith("/a/docs/ontology,/b/docs/ontology");
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual(["/a/docs/ontology", "/b/docs/ontology"]);
    expect(m.DOGFOOD_VAULT_PATH).toBe("/a/docs/ontology");
    expect(m.hasDogfoodVaultPath()).toBe(true);
  });

  it("공백과 빈 항목을 버린다", async () => {
    const m = await loadWith(" /a/docs/ontology , , /b/docs/ontology ");
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual(["/a/docs/ontology", "/b/docs/ontology"]);
  });

  /**
   * **This is the public build's case.** Unconfigured, there are zero candidates and the shortcut
   * quietly does not exist — more honest than pretending to open a path that is not there. And no
   * personal path ships in the bundle.
   */
  it("설정이 없으면 후보가 비고, 단축키는 없는 것이 된다", async () => {
    const m = await loadWith(undefined);
    expect([...m.DOGFOOD_VAULT_PATH_CANDIDATES]).toEqual([]);
    expect(m.DOGFOOD_VAULT_PATH).toBe("");
    expect(m.hasDogfoodVaultPath()).toBe(false);
  });
});

describe("resolveDogfoodVaultPath — 후보 선택", () => {
  it("런타임에 실재하는 첫 후보를 고른다", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    const exists = vi.fn(async (path: string) => path === "/old/docs/ontology");
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/old/docs/ontology");
    expect(exists).toHaveBeenCalledWith("/new/docs/ontology");
  });

  it("앞 후보가 실재하면 뒤는 묻지 않는다", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    const exists = vi.fn(async () => true);
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/new/docs/ontology");
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it("아무 후보도 증명되지 않으면 첫 후보를 돌려준다", async () => {
    const m = await loadWith("/new/docs/ontology,/old/docs/ontology");
    await expect(m.resolveDogfoodVaultPath(async () => false)).resolves.toBe("/new/docs/ontology");
  });

  it("런타임 probe 가 던져도 다음 후보로 넘어간다", async () => {
    const m = await loadWith("/broken/docs/ontology,/ok/docs/ontology");
    const exists = vi.fn(async (path: string) => {
      if (path === "/broken/docs/ontology") throw new Error("probe failed");
      return true;
    });
    await expect(m.resolveDogfoodVaultPath(exists)).resolves.toBe("/ok/docs/ontology");
  });
});
