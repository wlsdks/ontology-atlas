import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Korean text breaks between words on every screen, from one rule.
 *
 * Before 2026-09-25 each screen opted in with its own `break-keep`, and any element that
 * forgot wrapped mid-word (a lone final syllable on the last line). The rule now lives on `body` under
 * `:root:lang(ko)`; this gate keeps it there, keeps it inherited rather than per class, and
 * keeps it out of every `@layer`, where a utility layer would quietly win it back.
 */
const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
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
 * matches the first frame of a `/ko/*` page rather than the frame after hydration. The rendered
 * proof is `tests/e2e/hangul-first-paint.spec.ts`; this keeps the script's locale list equal to
 * the router's and free of interpolation (the same boundary `JsonLd` owns).
 */
describe("<html lang> is right before the first paint", () => {
  const boot = readFileSync(join(ROOT, "src", "shared", "ui", "accent-boot-script.tsx"), "utf8");
  const routing = readFileSync(join(ROOT, "src", "i18n", "routing.ts"), "utf8");
  const body = /const LANG_BOOT = \[([\s\S]*?)\]\.join/.exec(boot)?.[1] ?? "";

  it("the boot script plants lang from the path, and is rendered", () => {
    expect(body, "LANG_BOOT is missing from accent-boot-script.tsx").toContain("documentElement.lang");
    expect(boot).toMatch(/__html: ACCENT_BOOT \+ LANG_BOOT/);
    expect(body).not.toContain("${");
  });

  it("knows exactly the router's locales", () => {
    const locales = /locales: \[([^\]]*)\]/.exec(routing)?.[1].match(/'([a-z-]+)'/g)?.map((q) => q.slice(1, -1)) ?? [];
    expect(locales.length, "could not read routing.locales").toBeGreaterThan(0);
    const planted = [...body.matchAll(/s\[i\]==='([a-z-]+)'/g)].map((m) => m[1]);
    expect(planted.sort()).toEqual([...locales].sort());
  });
});

/**
 * **`break-keep` may not grow** (2026-09-25). The body rule makes a per-element `break-keep`
 * redundant on Korean pages, but the 273 existing sites stay until each screen is touched —
 * removing them is churn with no visible change. What must not happen is the old habit
 * continuing: a new site is a vote for "each element opts in", the pattern the body rule
 * replaced. Both spellings count — the utility `break-keep` and the hand-written
 * `[word-break:keep-all]` — in production source after comments are stripped (a comment that
 * *mentions* the class is not a use). Measured 2026-09-25: 256 + 108. Lower the ceiling when
 * you remove sites; never raise it.
 */
const BREAK_KEEP_CEILING = 364;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function countBreakKeep(source: string): number {
  const code = stripComments(source);
  return (code.match(/(?<![\w-])break-keep(?![\w-])/g) ?? []).length + (code.match(/\[word-break:keep-all\]/g) ?? []).length;
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next" || name === "data") continue;
        walk(p);
      } else if (/\.tsx?$/.test(name) && !/\.(test|spec|stories)\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "app"));
  return out;
}

describe("per-element break-keep does not grow", () => {
  it("counts a class use and ignores a comment", () => {
    expect(countBreakKeep('<p className="break-keep text-body">')).toBe(1);
    expect(countBreakKeep('<p className="[word-break:keep-all]">')).toBe(1);
    expect(countBreakKeep("/* break-keep */ // break-keep")).toBe(0);
    expect(countBreakKeep('"[&_h1]:break-keep"')).toBe(1);
  });

  it(`stays at or under ${BREAK_KEEP_CEILING}`, () => {
    const files = productionFiles();
    expect(files.length, "the walk found no source — the ceiling would pass vacuously").toBeGreaterThan(500);
    const perFile = files
      .map((f) => [relative(ROOT, f), countBreakKeep(readFileSync(f, "utf8"))] as const)
      .filter(([, n]) => n > 0);
    const total = perFile.reduce((sum, [, n]) => sum + n, 0);
    expect(total, "the walk found no break-keep at all — the scan is broken or the ceiling should drop to 0").toBeGreaterThan(0);
    expect(
      total,
      `break-keep sites: ${total} > ceiling ${BREAK_KEEP_CEILING}. Korean pages already keep words whole from ` +
        "`:root:lang(ko) body` (app/globals.css); drop the class from the new site. Top files: " +
        perFile.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(", "),
    ).toBeLessThanOrEqual(BREAK_KEEP_CEILING);
  });
});
