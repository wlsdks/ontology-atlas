import { describe, expect, it } from "vitest";

import { folderRelativePage, wikiCheckOutcome } from "./wiki-check-outcome";

const answer = (text: string) => ({ outcome: "completed" as const, stopReason: "end_turn", events: [{ kind: "agent" as const, id: "a", text }] });
const block = (value: unknown) => `Report.\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

describe("reading a finished wiki check", () => {
  it("never reads an answer without the report list as nothing to fix", () => {
    expect(wikiCheckOutcome(answer("Everything looks fine to me."))).toEqual({ kind: "unreadable" });
  });

  it("reads a report that states zero counts as clean", () => {
    const outcome = wikiCheckOutcome(answer(block({ counts: { disagreement: 0, superseded: 0, missingLink: 0, nameWithoutPage: 0, uncertain: 0 }, findings: [], nodeCandidates: [] })));
    expect(outcome).toMatchObject({ kind: "report", report: { itemCount: 0, pageCount: 0 } });
  });

  it("counts findings and the distinct pages they name", () => {
    const outcome = wikiCheckOutcome(answer(block({
      findings: [
        { code: "disagreement", pages: ["wiki/alpha", "wiki/beta"], summary: "Two launch dates." },
        { code: "missing-link", pages: ["wiki/beta.md"], summary: "Beta does not link Alpha." },
      ],
      nodeCandidates: [{ name: "Billing", kind: "domain", pages: ["wiki/gamma"], why: "Named on three pages." }],
    })));
    expect(outcome).toMatchObject({ kind: "report", report: { itemCount: 3, pageCount: 3 } });
  });

  it.each([
    ["cancelled", "cancelled", { kind: "stopped" }],
    ["cancelled", "session_closed", { kind: "failed" }],
    ["failed", null, { kind: "failed" }],
  ] as const)("reads a %s turn ending with %s as %o", (outcome, stopReason, expected) => {
    expect(wikiCheckOutcome({ outcome, stopReason, events: [] })).toEqual(expected);
  });
});

describe("naming a page the agent reads", () => {
  it("names a wiki page the way the folder stores it, and nothing outside the folder", () => {
    expect(folderRelativePage("/Users/probe/launch/wiki/alpha.md", "/Users/probe/launch")).toBe("wiki/alpha");
    expect(folderRelativePage("sources/a.csv", "/Users/probe/launch")).toBe("sources/a.csv");
    expect(folderRelativePage("/etc/hosts", "/Users/probe/launch")).toBeNull();
  });
});
