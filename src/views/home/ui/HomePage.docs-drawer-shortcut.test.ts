import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A source-level guard, since HomePage has no render harness: with the agent dock open only
 * the `d` drawer
 * toggle goes quiet, or the full-width drawer paints over the answer. The dock is not modal.
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
    // ⌘K and `?` stay usable beside the dock.
    expect(keyboardSource).not.toContain("agentDockOpen: agentDockOpen");
    expect(keyboardSource).toContain("agentAwaitingDecision: acpTurnActivityFrame?.activity.state");
  });
});
