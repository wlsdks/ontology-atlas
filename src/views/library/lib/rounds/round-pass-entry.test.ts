import { describe, expect, it } from "vitest";

import type { RoundRecord, RoundUndone } from "@/entities/library-round";

import { buildFailedPassEntry, buildFinishedPassEntry, buildRevisedPagesLogLine, type PassEntryStart } from "./round-pass-entry";

const start: PassEntryStart = {
  v: 1,
  id: "pass-1",
  roundId: "round-1",
  roundName: "Nightly",
  kind: "consistency",
  startedAt: "2026-11-22T01:00:00.000Z",
  places: ["vault"],
  trigger: "clock",
};
const endedAt = new Date("2026-11-22T01:05:00.000Z");
const round = { id: "round-1", name: "Nightly", kind: "consistency", connectorName: null } as unknown as RoundRecord;

const finished = (overrides: Partial<Parameters<typeof buildFinishedPassEntry>[0]> = {}) =>
  buildFinishedPassEntry({
    round,
    start,
    endedAt,
    check: { checked: 4, stalePages: ["wiki/a"], staleSources: ["sources/a.md"] } as never,
    refreshed: 0,
    failed: false,
    written: ["wiki/a.md"],
    refused: [],
    called: [],
    agentTurns: 1,
    answer: null,
    undone: [],
    leftAsIs: [],
    stoppedByPerson: false,
    note: undefined,
    ...overrides,
  });

describe("buildFinishedPassEntry", () => {
  it("records the pages written and counts the pass as redrafted", () => {
    const entry = finished();
    expect(entry).toMatchObject({ outcome: "redrafted", checked: 4, stale: ["wiki/a"], written: ["wiki/a.md"], endedAt: endedAt.toISOString() });
  });

  it("leaves a page the pass put back out of what it wrote and calls the pass failed", () => {
    const undone: RoundUndone[] = [{ path: "wiki/a.md", reason: "not-draft", action: "restored" }];
    const entry = finished({ undone });
    expect(entry.written).toEqual([]);
    expect(entry.outcome).toBe("failed");
    expect(entry.undone).toEqual(undone);
  });

  it("keeps a page whose undo failed among the written ones, because it is still on disk", () => {
    const entry = finished({ undone: [{ path: "wiki/a.md", reason: "unreadable", action: "failed" }] });
    expect(entry.written).toEqual(["wiki/a.md"]);
  });

  it("marks a pass the person stopped and lets that win over the agent note", () => {
    expect(finished({ stoppedByPerson: true, note: "no-agent" }).note).toBe("stopped");
    expect(finished({ note: "no-agent" }).note).toBe("no-agent");
    expect(finished().note).toBeUndefined();
  });

  it("carries the agent's answer as the summary only for a review that did not fail", () => {
    const ontology = { ...round, kind: "ontology" } as RoundRecord;
    expect(finished({ round: ontology, check: null, answer: "All consistent." }).summary).toBe("All consistent.");
    expect(finished({ round: ontology, check: null, answer: "All consistent.", failed: true }).summary).toBe("");
    expect(finished({ answer: "ignored" }).summary).toBe("");
  });
});

describe("buildFailedPassEntry", () => {
  it("reports the error message as the summary of a failed pass with nothing written", () => {
    expect(buildFailedPassEntry({ start, endedAt, error: new Error("no-manifest"), stoppedByPerson: false })).toMatchObject({
      outcome: "failed",
      summary: "no-manifest",
      written: [],
      agentTurns: 0,
    });
    expect(buildFailedPassEntry({ start, endedAt, error: "boom", stoppedByPerson: true })).toMatchObject({ summary: "boom", note: "stopped" });
  });
});

describe("buildRevisedPagesLogLine", () => {
  it("names the stale sources for a consistency pass and each revised page without its folder or extension", () => {
    const entry = finished({ check: { checked: 4, stalePages: ["wiki/a"], staleSources: [] } as never });
    expect(buildRevisedPagesLogLine(round, entry)).toEqual({
      at: endedAt.toISOString(),
      kind: "compile",
      summary: "a → a (revised)",
      writer: "round:Nightly",
    });
  });

  it("names the connector for a service pass", () => {
    const service = { ...round, kind: "service", connectorName: "Drive" } as RoundRecord;
    const entry = finished({ round: service, check: null, refreshed: 2 });
    expect(buildRevisedPagesLogLine(service, entry)?.summary).toBe("Drive → a (revised)");
  });

  it("writes no line when no wiki page was written", () => {
    expect(buildRevisedPagesLogLine(round, finished({ written: ["notes/x.md"] }))).toBeNull();
  });
});
