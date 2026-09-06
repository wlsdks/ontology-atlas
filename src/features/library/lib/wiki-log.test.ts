import { describe, expect, it } from "vitest";

import { describeCompileTurn, describeLintTurn, formatWikiLogEntry, parseWikiLog } from "./wiki-log";

describe("a log line is one parseable line", () => {
  it("round-trips through format and parse", () => {
    const entry = { at: "2026-09-06T18:05:12Z", kind: "compile" as const, summary: "sources/a.pdf → a (new)", writer: "agent:claude" };
    const line = formatWikiLogEntry(entry);
    expect(line).toBe("## [2026-09-06T18:05:12Z] compile | sources/a.pdf → a (new) | agent:claude");
    expect(parseWikiLog(`# Wiki log\n\nprose\n\n${line}\n`)).toEqual([entry]);
  });

  it("flattens a summary that carries newlines, so the file stays one line per event", () => {
    expect(formatWikiLogEntry({ at: "t", kind: "lint", summary: "a\n  b", writer: "human" })).toBe("## [t] lint | a b | human");
  });

  it("skips lines that are not entries rather than failing", () => {
    expect(parseWikiLog("## [t] unknown | x | y\n- a bullet\n")).toEqual([]);
  });
});

describe("the compile line is read from the folder, not from the agent", () => {
  it("names new pages, revised pages, and the sources the turn was given", () => {
    const before = new Map([["wiki/plan", 1], ["wiki/arch", 1]]);
    const after = new Map([["wiki/plan", 2], ["wiki/arch", 1], ["wiki/runbook", 5]]);
    expect(describeCompileTurn({ sources: ["sources/ops-runbook.pdf"], before, after })).toBe(
      "sources/ops-runbook.pdf → runbook (new), plan (revised)",
    );
  });

  it("says so when nothing changed", () => {
    const same = new Map([["wiki/plan", 1]]);
    expect(describeCompileTurn({ sources: ["sources/x.txt"], before: same, after: same })).toBe("sources/x.txt → no page changed");
  });
});

describe("the lint line carries the report's counts when the report states them", () => {
  it("reads the four counts from the brief's own closing shape", () => {
    const text = "### Counts\n- Disagreement: 0 (1 uncertain)\n- Superseded claim: 1\n- Missing cross-reference: 2\n- Concept without a page: 6\n";
    expect(describeLintTurn(text)).toBe("disagreement 0 · superseded 1 · missing-link 2 · name-without-page 6");
  });

  it("does not invent counts the report did not state", () => {
    expect(describeLintTurn("I read the pages and found nothing to report.")).toBe("ran; counts not stated");
    expect(describeLintTurn(null)).toBe("ran; counts not stated");
  });
});
