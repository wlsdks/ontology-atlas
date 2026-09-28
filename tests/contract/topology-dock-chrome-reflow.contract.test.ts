import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

const inspector = readFileSync("src/views/home/model/use-topology-inspector-state.tsx", "utf8");
const chrome = readFileSync("src/views/home/ui/TopologyCommandChrome.tsx", "utf8");
const canvas = readFileSync("src/views/home/ui/TopologyCanvasSurface.tsx", "utf8");
const hint = readFileSync("src/widgets/search-hint/ui/SearchHint.tsx", "utf8");
const fit = readFileSync("src/widgets/topology-controls/ui/TopologyFitControl.tsx", "utf8");
const css = readGlobalCss();

describe("14-inch map chrome reflows around the agent dock and node inspector", () => {
  it("agent dock requests compact top chrome instead of overlapping the search lane", () => {
    expect(inspector).toMatch(
      /const topologyUtilityChromeCompact\s*=\s*[^;]*agentDockRequestedOpen/,
    );
  });

  it("the toolbar reserve and the utility lane follow one selection flag, so a deselect moves nothing twice", () => {
    expect(chrome).toMatch(
      /data-right-inspector-reserve=\{\s*inspectorOwnsRightRail \? "recenter-in-remaining-map" : undefined\s*\}/,
    );
    expect(chrome).toMatch(/\{inspectorOwnsRightRail \? null : \(/);
    expect(chrome).not.toMatch(/nodePanelMounted/);
    expect(chrome).toContain('data-testid="topology-top-toolbar"');
    expect(hint).not.toMatch(/\babsolute right-/);
  });

  it("the wide reserve is a margin outside the toolbar's transition, on one clock for left and right", () => {
    const reserve = css.match(
      /\[data-testid='topology-top-toolbar'\]\[data-right-inspector-reserve='recenter-in-remaining-map'\]\s*\{([^}]*)\}/,
    );
    expect(reserve?.[1]).toMatch(
      /margin-right:\s*calc\(\s*var\(--map-panel-width\)\s*\+\s*var\(--topology-node-popover-right-inset\)\s*\)/,
    );
    const toolbar = css.match(
      /\[data-testid='topology-top-toolbar'\]\[data-agent-dock-adjacent-rail='true'\]\s*\{([^}]*)\}/,
    );
    expect(toolbar?.[1]).toMatch(/transition-property:\s*left,\s*right;/);
    expect(toolbar?.[1]).toMatch(/transition-duration:\s*var\(--agent-panel-reflow-duration\);/);
    expect(toolbar?.[1]).toMatch(/transition-timing-function:\s*var\(--topology-motion-ease-out\);/);
    expect(chrome).not.toContain("transition-[left,right]");
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
