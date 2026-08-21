import { describe, expect, it, vi } from "vitest";

import {
  acpHeartbeatAgentName,
  buildAcpTurnHeartbeat,
  createVaultAcpHeartbeatStore,
} from "./acp-agent-heartbeat";

/**
 * 2026-08-17 실측. 앱 안 에이전트가 만든 노드가 전부 `agent:unknown` 이었다 —
 * 같은 쓰기에서 `activity.jsonl` 에는 `codex-mcp-client` 라고 적혔는데도.
 * `created_by` 는 「사람이 의도적으로 등록한 이름」만 받는데, 등록할 방법이
 * 아무 데도 없었다. 앱이 대신 등록한다(소유자 지시).
 */
describe("앱 안 에이전트의 볼트 등록", () => {
  const at = new Date("2026-08-17T01:23:45.000Z");
  const activity = {
    state: "verifying" as const,
    summary: "관계 편집 흐름을 확인해줘",
    ontologySlug: "capabilities/reviewed-ontology-writing",
    toolName: "validate_vault",
  };

  it("이름과 시각을 그대로 싣는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.agent).toBe("codex-acp");
    expect(beat.updatedAt).toBe("2026-08-17T01:23:45.000Z");
  });

  it("ACP 도구가 실제로 밝힌 목표와 대상을 싣는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.focus.ontologySlug).toBe("capabilities/reviewed-ontology-writing");
    expect(beat.focus.summary).toBe("관계 편집 흐름을 확인해줘");
    expect(beat.focus.files).toEqual([]);
  });

  it("관측한 도구만 증거로 싣고 계획은 지어내지 않는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity });
    expect(beat.plan).toEqual([]);
    expect(beat.evidence).toEqual({ mcp: ["validate_vault"], source: [], codegraph: [], verification: [] });
  });

  it("ACP가 관측한 현재 단계를 상태로 적는다", () => {
    expect(buildAcpTurnHeartbeat({ agent: "codex-acp", at, activity }).state).toBe("verifying");
  });
});

describe("볼트에 적을 이름", () => {
  it("실행기 id 를 그대로 쓴다 — 새 이름 체계를 만들지 않는다", () => {
    expect(acpHeartbeatAgentName("codex-acp")).toBe("codex-acp");
    expect(acpHeartbeatAgentName("claude-acp")).toBe("claude-acp");
  });

  it("앞뒤 공백은 다듬는다", () => {
    expect(acpHeartbeatAgentName("  codex-acp  ")).toBe("codex-acp");
  });

  /*
   * 이름이 이상하면 **등록하지 않는다.** `created_by` 는 볼트에 영구히 박히는
   * 값이라, 모양이 깨진 것을 적느니 종전대로 `agent:unknown` 이 낫다.
   */
  it("모양이 깨진 것은 등록하지 않는다 — 모름이 낫다", () => {
    for (const bad of ["", "   ", "a/b", "a b", "../x", "a\nb", "\u0000x", null, undefined, 7]) {
      expect(acpHeartbeatAgentName(bad), String(bad)).toBeNull();
    }
  });

  it("지나치게 긴 이름도 거절한다", () => {
    expect(acpHeartbeatAgentName("a".repeat(101))).toBeNull();
    expect(acpHeartbeatAgentName("a".repeat(100))).toBe("a".repeat(100));
  });
});

describe("하트비트 파일 쓰기 순서", () => {
  it("마지막 clear가 느린 write를 추월하지 않는다", async () => {
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
