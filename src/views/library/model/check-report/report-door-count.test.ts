import { describe, expect, it } from "vitest";

import { reportDoorCount } from "./report-door-count";

const empty = { structuralFindings: 0, agentFindings: 0, agentNames: 0, wikiPageCount: 0, hasRecordedCheck: false };

describe("reportDoorCount", () => {
  it("shows no number for an empty wiki that was never checked", () => {
    expect(reportDoorCount(empty)).toBeNull();
  });

  it("shows a zero once pages exist or a check was recorded", () => {
    expect(reportDoorCount({ ...empty, wikiPageCount: 2 })).toBe(0);
    expect(reportDoorCount({ ...empty, hasRecordedCheck: true })).toBe(0);
  });

  it("adds the app's findings, the agent's findings and its names", () => {
    expect(reportDoorCount({ ...empty, structuralFindings: 4, agentFindings: 2, agentNames: 1 })).toBe(7);
  });
});
