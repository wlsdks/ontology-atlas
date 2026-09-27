import { describe, expect, it, vi } from "vitest";

import {
  acpHeartbeatAgentName,
  buildAcpTurnHeartbeat,
  createVaultAcpHeartbeatStore,
} from "./acp-agent-heartbeat";

/**
 * `created_by` accepts only a deliberately registered name; choosing the runtime is that
 * registration.
 */
describe("registers an in-app agent in the vault", () => {
  const at = new Date("2026-08-17T01:23:45.000Z");
  const activity = {
    state: "verifying" as const,
    summary: "관계 편집 흐름을 확인해줘",
    ontologySlug: "capabilities/reviewed-ontology-writing",
    toolName: "validate_vault",
  };

  it("carries the name and time unchanged", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.agent).toBe("codex-acp");
    expect(beat.updatedAt).toBe("2026-08-17T01:23:45.000Z");
  });

  it("carries the goal and target the ACP tool actually stated", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.focus.ontologySlug).toBe("capabilities/reviewed-ontology-writing");
    expect(beat.focus.summary).toBe("관계 편집 흐름을 확인해줘");
    expect(beat.focus.files).toEqual([]);
  });

  it("carries only observed tools as evidence and invents no plan", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.plan).toEqual([]);
    expect(beat.evidence).toEqual({ mcp: ["validate_vault"], source: [], codegraph: [], verification: [] });
  });

  it("records the current ACP-observed step as the status", () => {
    expect(buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity }).state).toBe("verifying");
  });
});

describe("vault name for the agent", () => {
  it("uses the runner id as-is instead of inventing a naming scheme", () => {
    expect(acpHeartbeatAgentName("codex-acp")).toBe("codex-acp");
    expect(acpHeartbeatAgentName("claude-acp")).toBe("claude-acp");
  });

  it("trims surrounding whitespace", () => {
    expect(acpHeartbeatAgentName("  codex-acp  ")).toBe("codex-acp");
  });

  // `created_by` is permanent, so `agent:unknown` beats writing a broken value.
  it("does not register a malformed name, since unknown beats wrong", () => {
    for (const bad of ["", "   ", "a/b", "a b", "../x", "a\nb", "\u0000x", null, undefined, 7]) {
      expect(acpHeartbeatAgentName(bad), String(bad)).toBeNull();
    }
  });

  it("rejects an overly long name", () => {
    expect(acpHeartbeatAgentName("a".repeat(101))).toBeNull();
    expect(acpHeartbeatAgentName("a".repeat(100))).toBe("a".repeat(100));
  });
});

describe("heartbeat file write order", () => {
  it("a final clear does not overtake a slow write", async () => {
    const calls: string[] = [];
    let releaseWrite: () => void = () => {};
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writable = {
      write: vi.fn(async () => {
        calls.push("write");
        await writeGate;
      }),
      close: vi.fn(async () => {
        calls.push("close");
      }),
    };
    const sidecar = {
      getFileHandle: vi.fn(async () => ({ createWritable: async () => writable })),
      removeEntry: vi.fn(async () => {
        calls.push("clear");
      }),
    };
    const root = {
      getDirectoryHandle: vi.fn(async () => sidecar),
    } as unknown as FileSystemDirectoryHandle;
    const store = createVaultAcpHeartbeatStore(root);
    const writing = store.write(
      buildAcpTurnHeartbeat({
        agent: "codex-acp",
        at: new Date("2026-08-17T01:23:45.000Z"),
        activity: { state: "planning", summary: "확인", ontologySlug: null, toolName: null },
      }),
    );
    await vi.waitFor(() => expect(writable.write).toHaveBeenCalledOnce());
    const clearing = store.clear();
    expect(sidecar.removeEntry).not.toHaveBeenCalled();
    releaseWrite();
    await Promise.all([writing, clearing]);
    expect(calls).toEqual(["write", "close", "clear"]);
  });
});
