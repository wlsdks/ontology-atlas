import { describe, expect, it } from "vitest";

import { agentOnlyReason } from "./agent-only-reason";

const t = ((key: string) => key) as unknown as Parameters<typeof agentOnlyReason>[2];

describe("agentOnlyReason", () => {
  it("has no reason where a coding agent is connected", () => {
    expect(agentOnlyReason("agent", true, t)).toBeNull();
    expect(agentOnlyReason("agent", false, t)).toBeNull();
  });

  it("names the web first, then each state of the installed app's agent route", () => {
    expect(agentOnlyReason("unavailable", false, t)).toBe("stage.blockedWeb");
    expect(agentOnlyReason("checking", true, t)).toBe("stage.blockedChecking");
    expect(agentOnlyReason("unavailable", true, t)).toBe("stage.blockedNoAgent");
    expect(agentOnlyReason("local", true, t)).toBe("stage.blockedLocalOnly");
  });
});
