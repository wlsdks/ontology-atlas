import { describe, expect, it } from "vitest";
import { resolveSessionAbilities } from "./session-abilities";

describe("resolveSessionAbilities", () => {
  it("내 폴더가 로드됐을 때만 쓰기 가능이다 — 샘플은 읽기 전용", () => {
    expect(
      resolveSessionAbilities({ dataSourceMode: "local", vaultStatus: "loaded" }).canWriteVault,
    ).toBe(true);
    expect(
      resolveSessionAbilities({ dataSourceMode: "static", vaultStatus: "loaded" }).canWriteVault,
    ).toBe(false);
    expect(
      resolveSessionAbilities({ dataSourceMode: "local", vaultStatus: "permission-needed" })
        .canWriteVault,
    ).toBe(false);
  });

  it("같은 폴더를 다시 읽는 중에는 쓰기 능력이 유지된다 — 순서가 흔들려 큐가 다시 그려지지 않게", () => {
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loading",
        reloadingSameVault: true,
      }).canWriteVault,
    ).toBe(true);
    // Switching to a different folder does not qualify — there really is nothing to write to then.
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loading",
        reloadingSameVault: false,
      }).canWriteVault,
    ).toBe(false);
  });

  it("heartbeat 파일이 있고 파싱되면 에이전트가 관측된 것으로 본다", () => {
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loaded",
        agentActivity: { exists: true, valid: true },
      }).agentObserved,
    ).toBe(true);
  });

  it("파일이 없거나 깨졌으면 미관측 — 넘길 상대가 있다고 단정하지 않는다", () => {
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loaded",
        agentActivity: { exists: false, valid: false },
      }).agentObserved,
    ).toBe(false);
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loaded",
        agentActivity: { exists: true, valid: false },
      }).agentObserved,
    ).toBe(false);
    expect(
      resolveSessionAbilities({ dataSourceMode: "local", vaultStatus: "loaded", agentActivity: null })
        .agentObserved,
    ).toBe(false);
  });
});
