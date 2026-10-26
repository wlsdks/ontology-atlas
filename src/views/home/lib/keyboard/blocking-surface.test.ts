import { describe, expect, it } from "vitest";

import { shouldSuppressGlobalShortcuts } from "./blocking-surface";

describe("shouldSuppressGlobalShortcuts", () => {
  it("global shortcuts stay live when no blocking surface is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, agentAwaitingDecision: false })).toBe(false);
  });

  it("swallows shortcuts while the add-concept composer is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, agentAwaitingDecision: false })).toBe(true);
  });

  // Otherwise a bare `d` opens the documents drawer over the pending permission card.
  it("swallows shortcuts while an agent awaits approval so nothing covers the decision", () => {
    expect(
      shouldSuppressGlobalShortcuts({
        createNodeOpen: false,
        agentAwaitingDecision: true,
      }),
    ).toBe(true);
  });

  it("swallows shortcuts when both are open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, agentAwaitingDecision: true })).toBe(true);
  });
});
