import { describe, expect, it } from "vitest";
import { resolveSessionAbilities } from "./session-abilities";

describe("resolveSessionAbilities", () => {
  it("can write only when the user folder is loaded, not the sample", () => {
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

  it("keeps write ability while the same folder reloads", () => {
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

  it("observes an agent when the heartbeat file exists and parses", () => {
    expect(
      resolveSessionAbilities({
        dataSourceMode: "local",
        vaultStatus: "loaded",
        agentActivity: { exists: true, valid: true },
      }).agentObserved,
    ).toBe(true);
  });

  it("observes no agent when the heartbeat file is missing or corrupt", () => {
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
