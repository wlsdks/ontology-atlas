import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `role-ledger.ts` never claims a per-role result, so the gutter tick needs wording beside it.
 * Source contract, not render: the mark exists only under `usesPairedDown`, whose `axisWidth` is 0
 * in jsdom.
 */
const SKETCH = readFileSync(
  join(process.cwd(), "src", "views", "architecture", "ui", "sketch", "RoleFaces.tsx"),
  "utf8",
);

/**
 * The `<text>` element carrying the comparison glyph, with JSX comments blanked so prose containing
 * `aria-hidden` is not matched.
 */
const MARK = (() => {
  const at = SKETCH.indexOf("data-testid={`architecture-delta-marker-${box.id}`}");
  expect(at).toBeGreaterThan(-1);
  const raw = SKETCH.slice(SKETCH.lastIndexOf("<text", at), SKETCH.indexOf("</text>", at));
  return raw.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
})();

describe("the architecture comparison mark carries its scope", () => {
  it("finds the mark, so a pass is not an empty scan", () => {
    expect(MARK).toContain("LEDGER_GLYPH");
  });

  it("is not hidden from assistive technology", () => {
    expect(MARK).not.toMatch(/\baria-hidden\b/);
  });

  it("names itself with the role face's own edge-shaped sentence", () => {
    expect(MARK).toContain("aria-label={ledger ? ledgerStatusLabel(ledger)");
    expect(MARK).toContain("<title>");
  });

  it("says something before any source has been observed", () => {
    expect(MARK).toContain("deltaUnknownLabel");
  });

  it("still draws the achromatic glyph — shapes, not colour", () => {
    expect(MARK).toContain("LEDGER_GLYPH[ledger.state]");
  });
});
