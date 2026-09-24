import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inspector = readFileSync("src/views/home/model/use-topology-inspector-state.tsx", "utf8");
const chrome = readFileSync("src/views/home/ui/TopologyCommandChrome.tsx", "utf8");
const canvas = readFileSync("src/views/home/ui/TopologyCanvasSurface.tsx", "utf8");
const hint = readFileSync("src/widgets/search-hint/ui/SearchHint.tsx", "utf8");
const fit = readFileSync("src/widgets/topology-controls/ui/TopologyFitControl.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("14-inch map chrome reflows around the agent dock and node inspector", () => {
  it("agent dock requests compact top chrome instead of overlapping the search lane", () => {
    expect(inspector).toMatch(
      /const topologyUtilityChromeCompact\s*=\s*[^;]*agentDockRequestedOpen/,
    );
  });

  // Since 2026-09-24 the reserve belongs to the whole top toolbar, which holds the
  // search lane and the utility lane in one box, rather than to the search lane alone.
  it("Home tells the top toolbar when the right inspector actually occupies the map", () => {
    expect(chrome).toMatch(
      /data-right-inspector-reserve=\{\s*nodePanelMounted \? "recenter-in-remaining-map" : undefined\s*\}/,
    );
    expect(chrome).toContain('data-testid="topology-top-toolbar"');
    expect(hint).not.toMatch(/\babsolute right-/);
  });

  it("wide layout recenters by the panel width and inset, not a screenshot-specific pixel", () => {
    expect(css).toContain(
      "[data-testid='topology-top-toolbar'][data-right-inspector-reserve='recenter-in-remaining-map']",
    );
    expect(css).toMatch(
      /right:\s*calc\(\s*var\(--map-panel-width\)\s*\+\s*var\(--topology-node-popover-right-inset\)\s*\+\s*2rem\s*\)/,
    );
  });

  it("pulls every right map-control rail toward the inset dock with one shared seam", () => {
    // Four rails since 2026-09-02: fit, guided tour, shortcuts help, and the growth
    // replay tile that took the fourth slot of the same rhythm.
    expect(chrome.match(/data-agent-dock-adjacent-rail/g)).toHaveLength(1);
    expect(canvas.match(/data-agent-dock-adjacent-rail/g)).toHaveLength(3);
    expect(fit).toContain('data-agent-dock-adjacent-rail="true"');
    expect(css).toContain("[data-agent-dock-adjacent-rail='true']");
    expect(css).toMatch(
      /right:\s*calc\(var\(--chrome-inset\)\s*\/\s*2\)/,
    );
    expect(css).toContain("transition-property: right, color, background-color, border-color");
    expect(css).toContain("var(--agent-panel-reflow-duration)");
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('useTopologyInspectorState({');
  expect(route).toContain('<TopologyCommandChrome');
  expect(route).toContain('<TopologyCanvasSurface');
});
