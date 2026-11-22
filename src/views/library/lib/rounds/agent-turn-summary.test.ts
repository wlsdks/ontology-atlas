import { describe, expect, it } from "vitest";

import { summarizeAgentTurn } from "./agent-turn-summary";

const notice = (text: string, detail?: string) => ({ kind: "notice" as const, id: `n-${text}-${detail}`, text, detail });
const agent = (text: string) => ({ kind: "agent" as const, id: `a-${text}`, text });

describe("summarizeAgentTurn", () => {
  it("lists each written page and called tool once, in the order the scope allowed them", () => {
    const summary = summarizeAgentTurn([
      notice("auto-allowed", "write wiki/a.md"),
      notice("auto-allowed", "call web_search"),
      notice("auto-allowed", "write wiki/a.md"),
      notice("auto-allowed", "read sources/x.md"),
    ]);
    expect(summary.written).toEqual(["wiki/a.md"]);
    expect(summary.called).toEqual(["web_search"]);
  });

  it("lists what the scope refused, once each, and ignores a refusal that names nothing", () => {
    const summary = summarizeAgentTurn([
      notice("auto-refused", "write notes/b.md"),
      notice("auto-refused", "write notes/b.md"),
      notice("auto-refused"),
    ]);
    expect(summary.refused).toEqual(["write notes/b.md"]);
  });

  it("keeps the agent's last words on one line, cut at the length a ledger line shows", () => {
    const summary = summarizeAgentTurn([agent("first"), agent(`last\n  words ${"x".repeat(400)}`)]);
    expect(summary.answer?.startsWith("last words x")).toBe(true);
    expect(summary.answer).toHaveLength(280);
  });

  it("has no answer when the agent said nothing", () => {
    expect(summarizeAgentTurn([notice("auto-allowed", "write wiki/a.md")]).answer).toBeNull();
    expect(summarizeAgentTurn([]).written).toEqual([]);
  });
});
