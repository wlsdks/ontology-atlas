import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One glyph, one role in the map chrome: `HelpCircle` is reserved for help, and the two meaning-review
 * entry points carry the same glyph. `MessageCircle` is owned by the Agent chip.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

const HOME = read("src", "views", "home", "ui", "TopologyCommandChrome.tsx");
const CANVAS = read("src", "views", "home", "ui", "TopologyCanvasSurface.tsx");
const PANEL = read("src", "widgets", "ontology-map", "ui", "OntologyMapDetailPanel.tsx");

/** The chip element that toggles the meaning workbench, whichever glyph it currently holds. */
function meaningChip(source: string): string {
  const at = source.indexOf('data-testid="topology-meaning-workbench-toggle"');
  expect(at).toBeGreaterThan(-1);
  const open = source.lastIndexOf("<ChromeChip", at);
  return source.slice(open, at);
}

/** The node panel's primary button for the same action. */
function meaningButton(source: string): string {
  const at = source.indexOf('data-testid="map-detail-panel-action-meaning"');
  expect(at).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf("</Button>", at));
}

describe("map chrome icon roles", () => {
  it("finds both surfaces, so a pass is not an empty scan", () => {
    expect(meaningChip(HOME).length).toBeGreaterThan(20);
    expect(meaningButton(PANEL).length).toBeGreaterThan(20);
  });

  it("does not open the meaning workbench with a help glyph", () => {
    expect(meaningChip(HOME)).not.toMatch(/HelpCircle|CircleHelp/);
  });

  it("gives the same action the same glyph on both surfaces", () => {
    const glyph = /<(\w+)\s*(?:\/>|size=)/.exec(meaningChip(HOME).replace("<ChromeChip", ""))?.[1];
    expect(glyph).toBeTruthy();
    expect(meaningButton(PANEL)).toContain(`<${glyph} `);
  });

  it("does not reuse the Agent chip's glyph in the same lane", () => {
    expect(meaningChip(HOME)).not.toContain("MessageCircle");
    expect(HOME).toContain("MessageCircle");
  });

  it("keeps a help glyph on the shortcut sheet, which really is help", () => {
    const at = CANVAS.indexOf('data-testid="topology-shortcuts-help-button"');
    expect(at).toBeGreaterThan(-1);
    const tile = CANVAS.slice(CANVAS.lastIndexOf("<ChromeTile", at), at);
    expect(tile).toMatch(/HelpCircle|CircleHelp/);
  });
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('<TopologyCommandChrome');
  expect(route).toContain('<TopologyCanvasSurface');
});
