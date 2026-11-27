import { describe, expect, it } from "vitest";

import { agentOnlyReason } from "./agent-only-reason";

const t = ((key: string) => key) as unknown as Parameters<typeof agentOnlyReason>[1];

describe("agentOnlyReason", () => {
  it("has no reason where a coding agent is connected", () => {
    expect(agentOnlyReason("agent", t)).toBeNull();
  });

  it("names each state of the agent route", () => {
    expect(agentOnlyReason("checking", t)).toBe("stage.blockedChecking");
    expect(agentOnlyReason("unavailable", t)).toBe("stage.blockedNoAgent");
    expect(agentOnlyReason("local", t)).toBe("stage.blockedLocalOnly");
  });
});
