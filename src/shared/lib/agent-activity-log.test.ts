import { describe, expect, it } from "vitest";
import {
  AGENT_WRITING_WINDOW_MS,
  deriveAgentWritingActivity,
  parseAgentActivityLog,
  type AgentActivityEntry,
} from "./agent-activity-log";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

function entry(overrides: Partial<AgentActivityEntry> & { at: string }): AgentActivityEntry {
  return {
    v: 1,
    tool: "add_concept",
    target: "storage",
    summary: "add_concept capability:storage",
    agent: "claude-code",
    why: null,
    ...overrides,
  };
}

function atOffset(msBeforeNow: number): string {
  return new Date(NOW - msBeforeNow).toISOString();
}

describe("deriveAgentWritingActivity", () => {
  it("읽을 줄이 없으면 아무것도 주장하지 않는다", () => {
    expect(deriveAgentWritingActivity([], NOW)).toEqual({
      writing: false,
      lastAt: null,
      lastTarget: null,
      lastTool: null,
    });
  });

  it("방금 쓴 줄이 있으면 쓰는 중이고, 어디였는지를 슬러그로 답한다", () => {
    const result = deriveAgentWritingActivity(
      [entry({ at: atOffset(3_000), tool: "add_relation", target: "storage" })],
      NOW,
    );
    expect(result).toEqual({
      writing: true,
      lastAt: NOW - 3_000,
      lastTarget: "storage",
      lastTool: "add_relation",
    });
  });

  it("창 경계는 포함, 1ms 만 넘어가면 쓰는 중이 아니다", () => {
    const onEdge = deriveAgentWritingActivity([entry({ at: atOffset(AGENT_WRITING_WINDOW_MS) })], NOW);
    const pastEdge = deriveAgentWritingActivity(
      [entry({ at: atOffset(AGENT_WRITING_WINDOW_MS + 1) })],
      NOW,
    );
    expect(onEdge.writing).toBe(true);
    expect(pastEdge.writing).toBe(false);
    // 창을 벗어나도 「마지막 활동이 언제·어디였나」는 남는다 — 화면이
    // 「2분 전 · 수납」처럼 말할 수 있어야 하기 때문.
    expect(pastEdge.lastAt).toBe(NOW - AGENT_WRITING_WINDOW_MS - 1);
    expect(pastEdge.lastTarget).toBe("storage");
  });

  it("창은 호출자가 좁힐 수 있다", () => {
    const entries = [entry({ at: atOffset(30_000) })];
    expect(deriveAgentWritingActivity(entries, NOW, { windowMs: 10_000 }).writing).toBe(false);
    expect(deriveAgentWritingActivity(entries, NOW, { windowMs: 60_000 }).writing).toBe(true);
  });

  it("줄 순서가 뒤섞여 있어도 가장 늦은 시각을 고른다", () => {
    const result = deriveAgentWritingActivity(
      [
        entry({ at: atOffset(10 * 60_000), target: "old-node", tool: "patch_concept" }),
        entry({ at: atOffset(1_000), target: "new-node", tool: "rename_concept" }),
        entry({ at: atOffset(5 * 60_000), target: "middle-node", tool: "delete_concept" }),
      ],
      NOW,
    );
    expect(result.writing).toBe(true);
    expect(result.lastTarget).toBe("new-node");
    expect(result.lastTool).toBe("rename_concept");
  });

  it("시각을 못 읽는 줄은 건너뛴다 (감사 로그가 깨져도 판정은 산다)", () => {
    const result = deriveAgentWritingActivity(
      [entry({ at: "not-a-date", target: "broken" }), entry({ at: atOffset(2_000), target: "real" })],
      NOW,
    );
    expect(result.lastTarget).toBe("real");
  });

  it("허용 오차를 넘게 미래로 찍힌 줄은 무시한다", () => {
    const result = deriveAgentWritingActivity(
      [
        entry({ at: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(), target: "from-the-future" }),
        entry({ at: atOffset(20 * 60_000), target: "past" }),
      ],
      NOW,
    );
    expect(result.writing).toBe(false);
    expect(result.lastTarget).toBe("past");
  });

  it("작은 시계 오차(미래 몇 초)는 지금 쓰는 중으로 본다", () => {
    const result = deriveAgentWritingActivity(
      [entry({ at: new Date(NOW + 5_000).toISOString(), target: "skewed" })],
      NOW,
    );
    expect(result.writing).toBe(true);
    expect(result.lastTarget).toBe("skewed");
  });

  it("슬러그가 아닌 대상은 null 로 내린다 — 죽은 링크를 만들지 않는다", () => {
    const batch = deriveAgentWritingActivity(
      [entry({ at: atOffset(1_000), tool: "add_concepts", target: "(batch)" })],
      NOW,
    );
    expect(batch.writing).toBe(true);
    expect(batch.lastTool).toBe("add_concepts");
    expect(batch.lastTarget).toBeNull();

    const absorbed = deriveAgentWritingActivity(
      [entry({ at: atOffset(1_000), tool: "absorb_document", target: "docs/notes/meeting.md" })],
      NOW,
    );
    expect(absorbed.lastTarget).toBeNull();
  });

  it("한글 슬러그는 통과한다", () => {
    const result = deriveAgentWritingActivity(
      [entry({ at: atOffset(1_000), target: "수납-정책" })],
      NOW,
    );
    expect(result.lastTarget).toBe("수납-정책");
  });

  it("파서가 낸 줄을 그대로 먹는다 (소비처가 하는 그대로)", () => {
    const raw = [
      `{"v":1,"at":"${atOffset(90_000)}","tool":"add_concept","target":"a","summary":"add a"}`,
      "broken",
      `{"v":1,"at":"${atOffset(4_000)}","tool":"add_relation","target":"b","summary":"a --depends_on--> b"}`,
    ].join("\n");
    const result = deriveAgentWritingActivity(parseAgentActivityLog(raw), NOW);
    expect(result).toMatchObject({ writing: true, lastTarget: "b", lastTool: "add_relation" });
  });
});
