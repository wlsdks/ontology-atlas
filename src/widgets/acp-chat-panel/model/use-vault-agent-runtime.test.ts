import { describe, expect, it } from "vitest";
import { resolveVaultAgentRoute, selectVaultAgentRuntimes } from "./use-vault-agent-runtime";

const runtime = { id: "claude", label: "Claude" };

describe("selectVaultAgentRuntimes", () => {
  it("keeps only ready, verified, guarded runtimes", () => {
    const picked = selectVaultAgentRuntimes([
      { id: "claude", label: "Claude", state: "ready", verified: true, isolated: true },
      { id: "claude-unverified", label: "Claude", state: "ready", verified: false, isolated: true },
      { id: "codex", label: "Codex", state: "missing", verified: true, isolated: true },
    ] as never);
    expect(picked.map((item) => item.id)).toEqual(["claude"]);
  });

  it("returns nothing for an absent list", () => {
    expect(selectVaultAgentRuntimes(null)).toEqual([]);
  });
});

describe("resolveVaultAgentRoute", () => {
  const ready = {
    bridgeAvailable: true,
    runtimeCheckComplete: true,
    serverCheckComplete: true,
    runtime,
    vaultRoot: "/vault",
    serverReady: true,
  };

  it("is unavailable without the desktop bridge, whatever else is ready", () => {
    expect(resolveVaultAgentRoute({ ...ready, bridgeAvailable: false })).toBe("unavailable");
  });

  it("is checking until both the runtime and the server have answered", () => {
    expect(resolveVaultAgentRoute({ ...ready, runtimeCheckComplete: false })).toBe("checking");
    expect(resolveVaultAgentRoute({ ...ready, serverCheckComplete: false })).toBe("checking");
  });

  it("opens the agent only with a runtime, a native folder path and a launchable server", () => {
    expect(resolveVaultAgentRoute(ready)).toBe("agent");
    expect(resolveVaultAgentRoute({ ...ready, runtime: null })).toBe("unavailable");
    expect(resolveVaultAgentRoute({ ...ready, vaultRoot: null })).toBe("unavailable");
    expect(resolveVaultAgentRoute({ ...ready, serverReady: false })).toBe("unavailable");
  });
});
