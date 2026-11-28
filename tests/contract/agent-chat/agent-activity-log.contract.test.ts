// Holds the web parser of the agent activity log to the entries the script server's reader
// reconstructed from the same lines (recorded 2026-11-28): broken lines and future versions are
// skipped, and an absent agent or reason stays null.
import { describe, expect, it } from "vitest";
import { parseAgentActivityLog } from "@/shared/lib/agent-activity/agent-activity-log";

const LINES = [
  '{"v":1,"at":"2026-07-21T10:00:00.000Z","tool":"add_relation","target":"a","summary":"a --depends_on--> b","agent":"claude-code","why":"근거"}',
  "broken-line-not-json",
  '{"v":2,"at":"2026-07-21T10:01:00.000Z","tool":"future","target":"x","summary":"미래 스키마"}',
  '{"v":1,"at":"2026-07-21T10:02:00.000Z","tool":"patch_concept","target":"c","summary":"patch c","agent":null,"why":null}',
];

describe("agent-activity-log parser contract (recorded reader answer ↔ web)", () => {
  it("same set of lines → same entries (including skipping broken lines and future v)", () => {
    const webEntries = parseAgentActivityLog(`${LINES.join("\n")}\n`);

    expect(webEntries.map((entry) => entry.summary)).toEqual(["a --depends_on--> b", "patch c"]);
    expect(webEntries).toHaveLength(2);
    expect(webEntries[0]).toMatchObject({ agent: "claude-code", why: "근거" });
    expect(webEntries[1]).toMatchObject({ agent: null, why: null });
  });
});
