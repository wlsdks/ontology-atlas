import { describe, expect, it } from "vitest";

import { selectTopologyEngine } from "./topology-engine-select";

const readyMapCanvasInput = {
  v2Enabled: false,
  analysisMode: "overview" as const,
  isAtLocalGraphRoot: true,
  hasTopologySkeleton: true,
  hasOntologyInsight: true,
};

describe("selectTopologyEngine — flag OFF (regression: matches pre-v2 behavior exactly)", () => {
  it("picks map-canvas at the ontology root, not on the graph tab, with skeleton+insight ready", () => {
    expect(selectTopologyEngine(readyMapCanvasInput)).toBe("map-canvas");
  });

  it("falls back to sigma when analysisMode is 'graph', even with skeleton+insight ready", () => {
    expect(
      selectTopologyEngine({ ...readyMapCanvasInput, analysisMode: "graph" }),
    ).toBe("sigma");
  });

  it("falls back to sigma once a local graph root is open (project detail drill-down)", () => {
    expect(
      selectTopologyEngine({ ...readyMapCanvasInput, isAtLocalGraphRoot: false }),
    ).toBe("sigma");
  });

  it("falls back to sigma when the topology skeleton isn't ready yet", () => {
    expect(
      selectTopologyEngine({ ...readyMapCanvasInput, hasTopologySkeleton: false }),
    ).toBe("sigma");
  });

  it("falls back to sigma when the ontology insight isn't ready yet", () => {
    expect(
      selectTopologyEngine({ ...readyMapCanvasInput, hasOntologyInsight: false }),
    ).toBe("sigma");
  });

  it("still picks map-canvas for every other analysisMode (focus/path/health) — only 'graph' routes to sigma", () => {
    for (const analysisMode of ["focus", "path", "health"] as const) {
      expect(selectTopologyEngine({ ...readyMapCanvasInput, analysisMode })).toBe(
        "map-canvas",
      );
    }
  });
});

describe("selectTopologyEngine — flag ON", () => {
  it("always picks map-v2 regardless of analysisMode/localGraphRoot/skeleton/insight readiness", () => {
    expect(selectTopologyEngine({ ...readyMapCanvasInput, v2Enabled: true })).toBe("map-v2");
    expect(
      selectTopologyEngine({
        v2Enabled: true,
        analysisMode: "graph",
        isAtLocalGraphRoot: false,
        hasTopologySkeleton: false,
        hasOntologyInsight: false,
      }),
    ).toBe("map-v2");
  });
});
