import { describe, expect, it } from "vitest";
import { resolveProjectAgentRoute, selectProjectAgentRuntimes } from "./use-project-agent";

const runtime = { id: "claude", label: "Claude" };

describe("selectProjectAgentRuntimes", () => {
  it("keeps only ready, verified, guarded runtimes", () => {
    const picked = selectProjectAgentRuntimes([
      { id: "claude", label: "Claude", state: "ready", verified: true, isolated: true },
      { id: "claude-unverified", label: "Claude", state: "ready", verified: false, isolated: true },
      { id: "codex", label: "Codex", state: "missing", verified: true, isolated: true },
    ] as never);
    expect(picked.map((item) => item.id)).toEqual(["claude"]);
  });

  it("returns nothing for an absent list", () => {
    expect(selectProjectAgentRuntimes(null)).toEqual([]);
  });
});

describe("resolveProjectAgentRoute", () => {
  const ready = {
    bridgeAvailable: true,
    runtimeCheckComplete: true,
    serverCheckComplete: true,
    runtime,
    vaultRoot: "/vault",
    serverReady: true,
  };

  it("is unavailable without the desktop bridge, whatever else is ready", () => {
    expect(resolveProjectAgentRoute({ ...ready, bridgeAvailable: false })).toBe("unavailable");
  });

  it("is checking until both the runtime and the server have answered", () => {
    expect(resolveProjectAgentRoute({ ...ready, runtimeCheckComplete: false })).toBe("checking");
    expect(resolveProjectAgentRoute({ ...ready, serverCheckComplete: false })).toBe("checking");
  });

  it("opens the agent only with a runtime, a native folder path and a launchable server", () => {
    expect(resolveProjectAgentRoute(ready)).toBe("agent");
    expect(resolveProjectAgentRoute({ ...ready, runtime: null })).toBe("unavailable");
    expect(resolveProjectAgentRoute({ ...ready, vaultRoot: null })).toBe("unavailable");
    expect(resolveProjectAgentRoute({ ...ready, serverReady: false })).toBe("unavailable");
  });
});
