import { describe, expect, it } from "vitest";

import { shouldSuppressGlobalShortcuts } from "./blocking-surface";

describe("shouldSuppressGlobalShortcuts", () => {
  it("global shortcuts stay live when no blocking surface is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: false, agentAwaitingDecision: false })).toBe(false);
  });

  it("swallows shortcuts while the add-concept composer is open", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: true, tourOpen: false, agentAwaitingDecision: false })).toBe(true);
  });

  // Measured regression: pressing `?` during the tour stacked the shortcut modal
  // over the tour card — two live role="dialog" surfaces. The tour is a blocking
  // surface with its own blocker and focus trap, so it takes the same rule.
  it("swallows shortcuts while the guided tour is open so two overlays never open together", () => {
    expect(shouldSuppressGlobalShortcuts({ createNodeOpen: false, tourOpen: true, agentAwaitingDecision: false })).toBe(true);
  });

  // Measured 2026-08-24 on the installed app: with a permission card waiting for an answer, a bare
  // `d` opened the documents drawer over it, and Escape then reached the card rather than the
  // drawer — the person could neither decide nor clear what was covering the decision.
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
