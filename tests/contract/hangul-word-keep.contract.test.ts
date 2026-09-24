import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Korean text breaks between words on every screen, from one rule.
 *
 * Before 2026-09-25 each screen opted in with its own `break-keep`, and any element that
 * forgot wrapped mid-word (a lone final syllable on the last line). The rule now lives on `body` under
 * `:root:lang(ko)`; this gate keeps it there, keeps it inherited rather than per class, and
 * keeps it out of every `@layer`, where a utility layer would quietly win it back.
 */
const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const RULE = /:root:lang\(ko\)\s+body\s*\{/;

function isOutsideLayers(css: string, index: number): boolean {
  const opens = new Set<number>();
  for (const m of css.matchAll(/@layer[^{;]*\{/g)) opens.add(m.index + m[0].length - 1);
  let depth = 0;
  let layerDepth = -1;
  for (let i = 0; i < index; i += 1) {
    if (css[i] === "{") {
      depth += 1;
      if (opens.has(i) && layerDepth < 0) layerDepth = depth;
    } else if (css[i] === "}") {
      if (depth === layerDepth) layerDepth = -1;
      depth -= 1;
    }
  }
  return layerDepth < 0;
}

describe("Hangul keeps its words whole", () => {
  const at = CSS.search(RULE);
  const block = at < 0 ? "" : CSS.slice(at, CSS.indexOf("}", at));

  it("declares the rule once, on body, for Korean pages", () => {
    expect(at, "`:root:lang(ko) body { … }` is missing from app/globals.css").toBeGreaterThan(-1);
    expect(CSS.match(new RegExp(RULE.source, "g"))).toHaveLength(1);
  });

  it("keeps words whole and still breaks a run that would overflow", () => {
    expect(block).toMatch(/word-break:\s*keep-all/);
    expect(block).toMatch(/overflow-wrap:\s*break-word/);
  });

  it("sits outside every @layer", () => {
    expect(isOutsideLayers(CSS, at)).toBe(true);
  });

  it("is not widened to every locale — keep-all is only word-safe for a spaced script", () => {
    expect(CSS).not.toMatch(/(^|\n)\s*body\s*\{[^}]*word-break:\s*keep-all/);
  });
});
