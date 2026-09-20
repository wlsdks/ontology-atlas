import { describe, expect, it } from "vitest";
import { computeVisibleSteps, DESTINATION_TOURS, TOUR_STEPS } from "./tour-steps";

function alwaysResolve(): boolean {
  return true;
}

describe("computeVisibleSteps", () => {
  it("includes all persona:'all' steps except datasheet when nothing is unresolvable and no selection yet", () => {
    const visible = computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: alwaysResolve,
    });
    // 7 persona:'all' steps minus datasheet (gated on hasSelection) = 6
    expect(visible.map((s) => s.id)).toEqual([
      "welcome",
      "nodes",
      "relations",
      "try-click",
      "index",
      "recent",
    ]);
  });

  it("includes datasheet once a selection exists", () => {
    const visible = computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: true,
      canResolveAnchor: alwaysResolve,
    });
    expect(visible.map((s) => s.id)).toContain("datasheet");
    expect(visible.map((s) => s.id)).toEqual([
      "welcome",
      "nodes",
      "relations",
      "try-click",
      "datasheet",
      "index",
      "recent",
    ]);
  });

  it("excludes the dev-only 'agent' step unless persona is 'dev'", () => {
    const all = computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: true,
      canResolveAnchor: alwaysResolve,
    });
    expect(all.map((s) => s.id)).not.toContain("agent");

    const dev = computeVisibleSteps(TOUR_STEPS, {
      persona: "dev",
      hasSelection: true,
      canResolveAnchor: alwaysResolve,
    });
    expect(dev.map((s) => s.id)).toContain("agent");
  });

  it("keeps the centered relation explanation even when a DOM anchor cannot resolve", () => {
    const visible = computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: (anchor) => {
        return anchor === null;
      },
    });
    expect(visible.map((s) => s.id)).toEqual(["welcome", "relations"]);
  });

  it("always keeps centered null-anchor explanations regardless of resolver", () => {
    const visible = computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: () => false,
    });
    expect(visible.map((s) => s.id)).toEqual(["welcome", "relations"]);
  });

  it("passes the canvas-node anchor target through to the resolver", () => {
    const seenTargets: string[] = [];
    computeVisibleSteps(TOUR_STEPS, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: (anchor) => {
        if (anchor && anchor.type === "canvas-node") seenTargets.push(anchor.target);
        return true;
      },
    });
    expect(seenTargets).toEqual(["project", "domain"]);
  });
});

describe("DESTINATION_TOURS — insights", () => {
  it("anchors its second page on the headline the screen opens on", () => {
    // Since #1704 /ontology/insights lands on the brief tab, so an anchor on any
    // other tab is absent on arrival and `computeVisibleSteps` drops the page,
    // leaving a one-page guide. `brief-headline` is on the landing tab.
    const steps = DESTINATION_TOURS.insights;
    expect(steps).toHaveLength(2);
    expect(steps[1].anchor).toEqual({ type: "testid", value: "brief-headline" });
  });

  it("keeps both pages when that anchor resolves", () => {
    const visible = computeVisibleSteps(DESTINATION_TOURS.insights, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: alwaysResolve,
    });
    expect(visible.map((s) => s.id)).toEqual(["insights-what", "insights-headline"]);
  });
});
