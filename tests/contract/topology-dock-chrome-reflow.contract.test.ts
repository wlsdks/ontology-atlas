import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
const hint = readFileSync("src/widgets/search-hint/ui/SearchHint.tsx", "utf8");
const fit = readFileSync("src/widgets/topology-controls/ui/TopologyFitControl.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("14-inch map chrome reflows around the agent dock and node inspector", () => {
  it("agent dock requests compact top chrome instead of overlapping the search lane", () => {
    expect(home).toMatch(
      /const topologyUtilityChromeCompact\s*=\s*[\s\S]*agentDockRequestedOpen/,
    );
  });

  it("Home tells the search lane when the right inspector actually occupies the map", () => {
    expect(home).toContain("rightInspectorReserved={nodePanelMounted}");
    expect(hint).toContain('data-right-inspector-reserve');
  });

  it("wide layout recenters by the panel width and inset, not a screenshot-specific pixel", () => {
    expect(css).toContain("[data-right-inspector-reserve='recenter-in-remaining-map']");
    expect(css).toMatch(
      /left:\s*calc\(\s*50%\s*-\s*\(var\(--topology-v2-panel-width\)\s*\+\s*var\(--topology-node-popover-right-inset\)\)\s*\/\s*2\s*\)/,
    );
  });

  it("pulls every right map-control rail toward the inset dock with one shared seam", () => {
    expect(home.match(/data-agent-dock-adjacent-rail/g)).toHaveLength(3);
    expect(fit).toContain('data-agent-dock-adjacent-rail="true"');
    expect(css).toContain("[data-agent-dock-adjacent-rail='true']");
    expect(css).toMatch(
      /right:\s*calc\(var\(--chrome-inset\)\s*\/\s*2\)/,
    );
    expect(css).toContain("transition-property: right, color, background-color, border-color");
    expect(css).toContain("var(--agent-panel-reflow-duration)");
  });
});
