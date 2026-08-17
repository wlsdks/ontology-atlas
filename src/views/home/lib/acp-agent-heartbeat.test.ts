import { describe, expect, it } from "vitest";

import {
  acpHeartbeatAgentName,
  buildAcpTurnHeartbeat,
} from "./acp-agent-heartbeat";

/**
 * 2026-08-17 실측. 앱 안 에이전트가 만든 노드가 전부 `agent:unknown` 이었다 —
 * 같은 쓰기에서 `activity.jsonl` 에는 `codex-mcp-client` 라고 적혔는데도.
 * `created_by` 는 「사람이 의도적으로 등록한 이름」만 받는데, 등록할 방법이
 * 아무 데도 없었다. 앱이 대신 등록한다(소유자 지시).
 */
describe("앱 안 에이전트의 볼트 등록", () => {
  const at = new Date("2026-08-17T01:23:45.000Z");

  it("이름과 시각을 그대로 싣는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at });
    expect(beat.agent).toBe("codex-acp");
    expect(beat.updatedAt).toBe("2026-08-17T01:23:45.000Z");
  });

  /*
   * ⚠️ 이 검사가 지키는 것은 「지도에 거짓말을 안 한다」다. 지도의 에이전트
   * 포커스 링은 `focus.ontologySlug` 를 보고 켜진다. 앱은 에이전트가 지금 어느
   * 노드를 만지는지 모르므로 그 칸은 비어 있어야 한다.
   */
  it("어느 노드를 만지는지는 **모른다고 적는다** — 링을 지어내지 않는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at });
    expect(beat.focus.ontologySlug).toBeNull();
    expect(beat.focus.summary).toBeNull();
    expect(beat.focus.files).toEqual([]);
  });

  it("증거와 계획도 지어내지 않는다", () => {
    const beat = buildAcpTurnHeartbeat({ agent: "codex-acp", at });
    expect(beat.plan).toEqual([]);
    expect(beat.evidence).toEqual({ mcp: [], source: [], codegraph: [], verification: [] });
  });

  it("차례가 도는 동안임을 상태로 적는다", () => {
    expect(buildAcpTurnHeartbeat({ agent: "codex-acp", at }).state).toBe("editing");
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
