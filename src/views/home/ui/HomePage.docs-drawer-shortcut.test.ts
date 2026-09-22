import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level guard, in the same shape as `HomePage.accessibility.test.ts`: HomePage has no
 * render harness, and the fact under test is one line inside an inline handler.
 *
 * 2026-08-31, installed app: pressing "Ask the agent" on a node opened the chat dock, and the
 * documents drawer (a full-width overlay toggled by the unmodified `d` shortcut) painted over
 * it, so the person saw a document list where the answer should have been. The dock is not a
 * modal, so the blocking-surface predicate must not swallow every shortcut; only the drawer
 * toggle goes quiet while the dock is open.
 */
const keyboardSource = readFileSync("src/views/home/model/use-topology-keyboard-tour.tsx", "utf8");
const homePageSource = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");

describe("documents drawer shortcut while the agent dock is open", () => {
  it("does not toggle the drawer over an open agent dock", () => {
    expect(homePageSource).toContain("useTopologyKeyboardTour({");
    const handler = keyboardSource.slice(
      keyboardSource.indexOf('combo: { key: "d" }'),
      keyboardSource.indexOf("setDocsDrawerOpen((v) => !v)"),
    );
    expect(handler).toContain("if (agentDockOpen) return;");
  });

  it("keeps the other global shortcuts alive while the dock is open", () => {
    // The dock is a side panel beside the map, not a modal: ⌘K and `?` stay usable.
    expect(keyboardSource).not.toContain("agentDockOpen: agentDockOpen");
    expect(keyboardSource).toContain("agentAwaitingDecision: acpTurnActivityFrame?.activity.state");
  });
});
