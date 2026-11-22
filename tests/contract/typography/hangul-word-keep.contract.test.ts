import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';
import { LOCALE_META, type AppLocale } from "../../../src/i18n/locales";

/**
 * Korean word-keep lives on `body` under `:root:lang(ko)`, inherited and outside every `@layer`,
 * where a utility layer would win it back.
 */
const ROOT = process.cwd();
const CSS = readGlobalCss();
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

/**
 * The boot script plants `<html lang>` from the path before the first paint, so the rule above
 * matches the first frame of a `/ko/*` page rather than the frame after hydration. This keeps the script's locale list equal to
 * the router's and free of interpolation (the same boundary `JsonLd` owns).
 */
describe("<html lang> is right before the first paint", () => {
  const boot = readFileSync(join(ROOT, "src", "shared", "ui", "document", "lang-boot-script.tsx"), "utf8");
  const routing = readFileSync(join(ROOT, "src", "i18n", "routing.ts"), "utf8");
  const body = /const LANG_BOOT = \[([\s\S]*?)\]\.join/.exec(boot)?.[1] ?? "";

  it("the boot script plants lang from the path, and is rendered", () => {
    expect(body, "LANG_BOOT is missing from lang-boot-script.tsx").toContain("documentElement.lang");
    expect(boot).toMatch(/__html: LANG_BOOT/);
    expect(body).not.toContain("${");
  });

  it("maps exactly the router's locales to the registry's html lang", () => {
    const locales = /locales: \[([^\]]*)\]/.exec(routing)?.[1].match(/'([a-z-]+)'/g)?.map((q) => q.slice(1, -1)) ?? [];
    expect(locales.length, "could not read routing.locales").toBeGreaterThan(0);
    const map = /var m=\{([^}]*)\};/.exec(body)?.[1] ?? "";
    const planted = Object.fromEntries([...map.matchAll(/([a-z-]+):'([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(planted).sort()).toEqual([...locales].sort());
    for (const locale of locales) {
      expect(planted[locale], `${locale} html lang`).toBe(LOCALE_META[locale as AppLocale].htmlLang);
    }
  });
});
