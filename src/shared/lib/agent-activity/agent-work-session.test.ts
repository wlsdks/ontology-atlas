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
  it("an empty log has zero tasks", () => {
    expect(deriveAgentWorkSessions([], NOW)).toEqual([]);
  });

  it("a measured mid-task silence (up to 133.9 seconds) stays one task", () => {
    const sessions = deriveAgentWorkSessions(
      [entry({ at: at(400_000) }), entry({ at: at(400_000 - 133_900) })],
      NOW,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entryCount).toBe(2);
  });

  it("a silence 1 ms over the threshold splits tasks (the boundary is inclusive)", () => {
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

  it("the measured log (53 lines, 11 min 40 s, longest silence 329 s) becomes two tasks", () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, i) => entry({ at: at(700_000 - i * 2_000) })),
      // 329 s of silence.
      ...Array.from({ length: 33 }, (_, i) => entry({ at: at(330_000 - i * 2_000) })),
    ];
    const sessions = deriveAgentWorkSessions(entries, NOW);
    expect(sessions).toHaveLength(2);
  });

  it("groups by time even when line order is shuffled", () => {
    const sessions = deriveAgentWorkSessions(
      [entry({ at: at(1_000) }), entry({ at: at(600_000) }), entry({ at: at(2_000) })],
      NOW,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0].startAt).toBe(NOW - 600_000);
    expect(sessions[1].entryCount).toBe(2);
  });

  it("counts branches by tool name, so rename is an edit rather than a delete plus an add", () => {
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

  it("a batch line counts as many as the rows in its summary", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(1_000), tool: "add_concepts", target: "(batch)", summary: "add_concepts 46 rows written" })],
      NOW,
    );
    expect(session.counts.added).toBe(46);
    expect(session.entryCount).toBe(1);
  });

  it("when the summary wording changes the count falls to 1 instead of breaking", () => {
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

  it("the last target survives even when a batch comes after it", () => {
    const [session] = deriveAgentWorkSessions(
      [
        entry({ at: at(3_000), target: "domains/community" }),
        entry({ at: at(2_000), tool: "add_relations", target: "(batch)", summary: "add_relations 50 rows written" }),
      ],
      NOW,
    );
    expect(session.lastTarget).toBe("domains/community");
    expect(session.lastTool).toBe("add_relations");
  });

  it("a task remembers the agent that last named itself (null does not erase the name)", () => {
    const [session] = deriveAgentWorkSessions(
      [
        entry({ at: at(3_000), agent: "codex" }),
        // A line with neither a heartbeat nor a connect greeting: an absent
        // name must not erase the previous one.
        entry({ at: at(2_000), agent: null }),
      ],
      NOW,
    );
    expect(session.agent).toBe("codex");
  });

  it("a task that never heard a name has a null agent (whitespace is not a name)", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(2_000), agent: null }), entry({ at: at(1_000), agent: "  " })],
      NOW,
    );
    expect(session.agent).toBeNull();
  });

  it("the newer name on a later line wins, so the last agent wins when two share a folder", () => {
    const [session] = deriveAgentWorkSessions(
      [entry({ at: at(3_000), agent: "claude-code" }), entry({ at: at(1_000), agent: "codex" })],
      NOW,
    );
    expect(session.agent).toBe("codex");
  });

  it("a task is finished only once the quiet threshold has passed", () => {
    const running = deriveAgentWorkSessions([entry({ at: at(1_000) })], NOW);
    const finished = deriveAgentWorkSessions([entry({ at: at(AGENT_TASK_IDLE_MS + 1) })], NOW);
    expect(running[0].done).toBe(false);
    expect(activeSession(running)).toBe(running[0]);
    expect(finished[0].done).toBe(true);
    expect(activeSession(finished)).toBeNull();
  });

  it("the id is fixed by start time, so the same task keeps its id when lines are added before it", () => {
    const first = deriveAgentWorkSessions([entry({ at: at(2_000) })], NOW);
    const grown = deriveAgentWorkSessions(
      [entry({ at: at(900_000) }), entry({ at: at(2_000) })],
      NOW,
    );
    expect(grown[1].id).toBe(first[0].id);
  });
});

describe("hasWrites", () => {
  it("all zeros is false, since a zero-added, zero-edited, zero-deleted summary is not information", () => {
    expect(hasWrites({ added: 0, edited: 0, removed: 0 })).toBe(false);
    expect(hasWrites({ added: 0, edited: 0, removed: 1 })).toBe(true);
  });
});
