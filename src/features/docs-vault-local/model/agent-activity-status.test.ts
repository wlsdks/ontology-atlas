import { describe, expect, it } from "vitest";
import {
  AGENT_ACTIVITY_RELATIVE_PATH,
  AGENT_ACTIVITY_STALE_AFTER_MS,
  emptyAgentActivityStatus,
  parseAgentActivityStatus,
} from "./agent-activity-status";

describe("agent activity status", () => {
  it("reports a missing heartbeat without inventing activity", () => {
    expect(parseAgentActivityStatus(null)).toEqual(emptyAgentActivityStatus());
  });

  it("rejects invalid heartbeat JSON with the reserved source path", () => {
    const status = parseAgentActivityStatus("{ nope");

    expect(status.exists).toBe(true);
    expect(status.valid).toBe(false);
    expect(status.heartbeat).toBeNull();
    expect(status.sourcePath).toBe(AGENT_ACTIVITY_RELATIVE_PATH);
    expect(status.errorMessage).toBeTruthy();
  });

  it("normalizes a valid heartbeat into current agent focus", () => {
    const updatedAt = "2026-06-06T05:50:00.000Z";
    const status = parseAgentActivityStatus(
      JSON.stringify({
        agent: "codex",
        state: "editing",
        focus: {
          summary: "Implement live heartbeat display",
          ontologySlug: "capabilities/agent-live-activity-contract",
          files: ["src/views/ontology-view/ui/parts/AgentStatusPopover.tsx", ""],
        },
        plan: ["run focused tests", "sync ontology"],
        evidence: {
          mcp: ["validate_vault"],
          codegraph: ["codegraph_context AgentStatusPopover"],
          verification: ["pnpm exec vitest run ..."],
        },
        updatedAt,
      }),
      Date.parse("2026-06-06T05:51:30.000Z"),
    );

    expect(status.exists).toBe(true);
    expect(status.valid).toBe(true);
    expect(status.stale).toBe(false);
    expect(status.ageMs).toBe(90_000);
    expect(status.heartbeat).toMatchObject({
      agent: "codex",
      state: "editing",
      focus: {
        summary: "Implement live heartbeat display",
        ontologySlug: "capabilities/agent-live-activity-contract",
        files: ["src/views/ontology-view/ui/parts/AgentStatusPopover.tsx"],
      },
      plan: ["run focused tests", "sync ontology"],
      updatedAt,
    });
  });

  it("marks old heartbeats stale", () => {
    const status = parseAgentActivityStatus(
      JSON.stringify({
        agent: "claude-code",
        state: "planning",
        focus: {},
        plan: [],
        evidence: {},
        updatedAt: "2026-06-06T05:00:00.000Z",
      }),
      Date.parse("2026-06-06T05:00:00.000Z") + AGENT_ACTIVITY_STALE_AFTER_MS + 1,
    );

    expect(status.valid).toBe(true);
    expect(status.stale).toBe(true);
  });
});
