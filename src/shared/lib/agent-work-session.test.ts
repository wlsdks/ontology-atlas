import { describe, expect, it } from "vitest";
import type { AgentActivityEntry } from "./agent-activity-log";
import {
  AGENT_TASK_IDLE_MS,
  activeSession,
  deriveAgentWorkSessions,
  entryWeight,
  hasWrites,
} from "./agent-work-session";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

function entry(overrides: Partial<AgentActivityEntry> & { at: string }): AgentActivityEntry {
  return {
    v: 1,
    tool: "add_concept",
    target: "capabilities/checkout",
    summary: "add_concept capability:capabilities/checkout",
    agent: "claude-code",
    why: null,
    ...overrides,
  };
}

const at = (msBeforeNow: number) => new Date(NOW - msBeforeNow).toISOString();

describe("deriveAgentWorkSessions", () => {
  it("빈 로그는 작업 0개", () => {
    expect(deriveAgentWorkSessions([], NOW)).toEqual([]);
  });

  it("실측 분포의 「작업 중 침묵」(최대 133.9초)은 한 작업으로 남는다", () => {
    const sessions = deriveAgentWorkSessions(
      [entry({ at: at(400_000) }), entry({ at: at(400_000 - 133_900) })],
      NOW,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entryCount).toBe(2);
  });

  it("임계값을 1ms 넘긴 침묵은 작업을 가른다 (경계는 포함)", () => {
    const base = 3 * AGENT_TASK_IDLE_MS;
    const onEdge = deriveAgentWorkSessions(
      [entry({ at: at(base) }), entry({ at: at(base - AGENT_TASK_IDLE_MS) })],
      NOW,
    );
    const pastEdge = deriveAgentWorkSessions(
      [entry({ at: at(base) }), entry({ at: at(base - AGENT_TASK_IDLE_MS - 1) })],
      NOW,
    );
    expect(onEdge).toHaveLength(1);
    expect(pastEdge).toHaveLength(2);
  });

  it("실측 로그(53줄 · 11분 40초 · 최대 침묵 329초)는 작업 2개가 된다", () => {
    // 소유자가 「1~2개」라고 부른 그 결과. 줄 단위면 53개였다.
    const entries = [
      ...Array.from({ length: 20 }, (_, i) => entry({ at: at(700_000 - i * 2_000) })),
      // 329초 침묵
      ...Array.from({ length: 33 }, (_, i) => entry({ at: at(330_000 - i * 2_000) })),
    ];
    const sessions = deriveAgentWorkSessions(entries, NOW);
    expect(sessions).toHaveLength(2);
  });

  it("줄 순서가 뒤섞여 있어도 시간순으로 묶는다", () => {
    const sessions = deriveAgentWorkSessions(
      [entry({ at: at(1_000) }), entry({ at: at(600_000) }), entry({ at: at(2_000) })],
      NOW,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0].startAt).toBe(NOW - 600_000);
    expect(sessions[1].entryCount).toBe(2);
  });

  it("갈래를 도구 이름으로 센다 — rename 은 삭제+추가가 아니라 편집이다", () => {
    const [session] = deriveAgentWorkSessions(
      [
        entry({ at: at(4_000), tool: "add_relation" }),
        entry({ at: at(3_000), tool: "rename_concept" }),
        entry({ at: at(2_000), tool: "delete_concept" }),
        entry({ at: at(1_000), tool: "remove_relation" }),
      ],
      NOW,
    );
    expect(session.counts).toEqual({ added: 1, edited: 1, removed: 2 });
  });

  it("배치 한 줄은 요약문의 행 수만큼 센다", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(1_000), tool: "add_concepts", target: "(batch)", summary: "add_concepts 46행 성공" })],
      NOW,
    );
    expect(session.counts.added).toBe(46);
    expect(session.entryCount).toBe(1);
  });

  it("요약 문구가 바뀌면 1로 떨어질 뿐 깨지지 않는다", () => {
    expect(
      entryWeight({
        v: 1,
        at: at(0),
        tool: "add_concepts",
        target: "(batch)",
        summary: "add_concepts wrote 46 rows",
        agent: null,
        why: null,
      }),
    ).toBe(1);
  });

  it("마지막 대상은 배치가 뒤에 와도 지워지지 않는다", () => {
    const [session] = deriveAgentWorkSessions(
      [
        entry({ at: at(3_000), target: "domains/community" }),
        entry({ at: at(2_000), tool: "add_relations", target: "(batch)", summary: "add_relations 50행 성공" }),
      ],
      NOW,
    );
    expect(session.lastTarget).toBe("domains/community");
    expect(session.lastTool).toBe("add_relations");
  });

  it("작업은 마지막으로 이름을 밝힌 에이전트를 기억한다 (null 이 이름을 지우지 않는다)", () => {
    const [session] = deriveAgentWorkSessions(
      [
        entry({ at: at(3_000), agent: "codex" }),
        // 하트비트도 연결 인사도 없던 줄 — 이름 없음이 직전 이름을 지우면 안 된다.
        entry({ at: at(2_000), agent: null }),
      ],
      NOW,
    );
    expect(session.agent).toBe("codex");
  });

  it("이름을 한 번도 못 들은 작업의 agent 는 null 이다 (공백은 이름이 아니다)", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(2_000), agent: null }), entry({ at: at(1_000), agent: "  " })],
      NOW,
    );
    expect(session.agent).toBeNull();
  });

  it("나중 줄의 새 이름이 이긴다 — 한 폴더를 두 에이전트가 이어 쓰면 마지막 쪽", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(3_000), agent: "claude-code" }), entry({ at: at(1_000), agent: "codex" })],
      NOW,
    );
    expect(session.agent).toBe("codex");
  });

  it("조용해진 지 임계값이 지나야 끝난 작업이다", () => {
    const running = deriveAgentWorkSessions([entry({ at: at(1_000) })], NOW);
    const finished = deriveAgentWorkSessions([entry({ at: at(AGENT_TASK_IDLE_MS + 1) })], NOW);
    expect(running[0].done).toBe(false);
    expect(activeSession(running)).toBe(running[0]);
    expect(finished[0].done).toBe(true);
    expect(activeSession(finished)).toBeNull();
  });

  it("id 는 시작 시각으로 고정 — 앞에 줄이 늘어도 같은 작업은 같은 id", () => {
    const first = deriveAgentWorkSessions([entry({ at: at(2_000) })], NOW);
    const grown = deriveAgentWorkSessions(
      [entry({ at: at(900_000) }), entry({ at: at(2_000) })],
      NOW,
    );
    expect(grown[1].id).toBe(first[0].id);
  });
});

describe("hasWrites", () => {
  it("전부 0이면 거짓 — 「추가 0 · 편집 0 · 삭제 0」은 정보가 아니다", () => {
    expect(hasWrites({ added: 0, edited: 0, removed: 0 })).toBe(false);
    expect(hasWrites({ added: 0, edited: 0, removed: 1 })).toBe(true);
  });
});
