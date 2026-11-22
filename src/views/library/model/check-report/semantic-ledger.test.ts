import { describe, expect, it } from "vitest";

import type { LintFinding, LintNodeCandidate } from "@/features/library";

import { CANDIDATE_FOLD, foldCandidates, groupFindings, lastCheckFoundSomething, logWhen, orderCandidates } from "./semantic-ledger";

const finding = (code: LintFinding["code"]) => ({ code, pages: ["wiki/a"], summary: code }) as LintFinding;
const candidate = (name: string, kind: string) => ({ name, kind, pages: [], why: "" }) as unknown as LintNodeCandidate;

describe("groupFindings", () => {
  it("orders kinds as the report does and leaves out kinds with no finding", () => {
    const groups = groupFindings([finding("missing-link"), finding("disagreement"), finding("missing-link")]);
    expect(groups.map((group) => [group.code, group.rows.length])).toEqual([
      ["disagreement", 1],
      ["missing-link", 2],
    ]);
  });
});

describe("candidates", () => {
  const ordered = orderCandidates([
    candidate("one", "term"),
    candidate("two", "capability"),
    candidate("three", "term"),
    candidate("four", "capability"),
  ]);

  it("puts the map kinds first and keeps each side's order", () => {
    expect(ordered.map((entry) => entry.name)).toEqual(["two", "four", "one", "three"]);
  });

  it("folds names past the limit behind a count and shows all once open", () => {
    const many = Array.from({ length: CANDIDATE_FOLD + 3 }, (_, index) => candidate(String(index), "capability"));
    expect(foldCandidates(many, false)).toEqual({ shown: many.slice(0, CANDIDATE_FOLD), folded: 3 });
    expect(foldCandidates(many, true)).toEqual({ shown: many, folded: 0 });
  });
});

describe("lastCheckFoundSomething", () => {
  it("reads a non-zero count in the log line, and nothing from zeros or no record", () => {
    expect(lastCheckFoundSomething({ summary: "2 findings, 0 names" })).toBe(true);
    expect(lastCheckFoundSomething({ summary: "0 findings, 0 names" })).toBe(false);
    expect(lastCheckFoundSomething({ summary: "10 findings" })).toBe(true);
    expect(lastCheckFoundSomething(null)).toBe(false);
  });
});

describe("logWhen", () => {
  it("returns the raw stamp when it does not parse", () => {
    expect(logWhen("not a date")).toBe("not a date");
  });

  it("formats a parsable stamp", () => {
    expect(logWhen("2026-03-02T10:00:00Z")).not.toBe("2026-03-02T10:00:00Z");
  });
});
