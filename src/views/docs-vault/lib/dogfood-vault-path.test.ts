import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * dogfood 볼트 단축키 — **경로는 빌드 설정에서 온다.**
 *
 * ## 왜 테스트가 바뀌었나 (2026-07-29)
 *
 * 종전엔 유지보수자의 홈 경로 두 개가 소스에 상수로 박혀 있었고, 이 테스트도
 * 그 값을 기대값으로 적어 두었다. 그 문자열은 **공개 배포 번들에 그대로 실려**
 * 나갔다(라이브 확인). 화면 노출 조건이 좁아 일반 방문자에겐 안 보였지만
 * 번들을 여는 사람에게는 읽히고, macOS 사용자명과 디렉터리 구조가 같이 나간다.
 * 게다가 그 경로는 유지보수자의 기계에만 있으므로 **나머지 100% 사용자에게는
 * 죽은 코드**였다.
 *
 * 이제 값은 `NEXT_PUBLIC_DOGFOOD_VAULT_PATHS` 에서 오고, 이 테스트는 **경로가
 * 아니라 규칙**을 잰다: 어떻게 파싱되는지, 어느 후보를 고르는지, 그리고 설정이
 * 없을 때(=공개 빌드) 조용히 없는 것이 되는지.
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
   * **공개 빌드가 이 경우다.** 설정이 없으면 후보가 0개이고 단축키는 조용히
   * 없는 것이 된다 — 없는 경로를 여는 시늉을 하는 것보다 정직하다. 그리고
   * 번들에는 어떤 개인 경로도 실리지 않는다.
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
