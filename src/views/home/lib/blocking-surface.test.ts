import { describe, expect, it } from "vitest";

import { shouldSuppressGlobalShortcuts } from "./blocking-surface";

describe("shouldSuppressGlobalShortcuts", () => {
  it("global shortcuts stay live when no blocking surface is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: false, agentAwaitingDecision: false })).toBe(false);
  });

  it("swallows shortcuts while the add-concept composer is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: false, agentAwaitingDecision: false })).toBe(true);
  });

  // The tour has its own blocker and focus trap, so `?` must not stack the shortcut modal on it.
  it("swallows shortcuts while the guided tour is open so two overlays never open together", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: true, agentAwaitingDecision: false })).toBe(true);
  });

  // Otherwise a bare `d` opens the documents drawer over the pending permission card.
  it("swallows shortcuts while an agent awaits approval so nothing covers the decision", () => {
    expect(
      shouldSuppressGlobalShortcuts({
        createNodeOpen: false,
        tourOpen: false,
        agentAwaitingDecision: true,
      }),
    ).toBe(true);
  });

  it("swallows shortcuts when both are open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: true, agentAwaitingDecision: false })).toBe(true);
  });
});
