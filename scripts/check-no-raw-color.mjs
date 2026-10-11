#!/usr/bin/env node
// Colour-tokenisation gate: every colour goes through a CSS variable (`.claude/rules/design.md`).
// The only exemption is `ALLOWLIST`: JS constants where CSS variables cannot reach (canvas, WebGL,
// OpenGraph). Run as `pnpm check:tokens`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const SRC_DIR = join(ROOT, "src");

// Several rgb tuples can map to one hue: where drift was converged onto a single
// hue, the pre-convergence values are watched too, so a regression that reintroduces
// any of them as a literal is caught.
const HUE_FAMILIES = [
  { name: "indigo", rgbs: [[94, 106, 210]] },
  { name: "indigo-line", rgbs: [[139, 151, 255]] },
  // These hues are listed to name which token to use; pass/fail is decided by the achromatic rule below.
  { name: "indigo-accent → var(--color-indigo-accent-a32/-a50)", rgbs: [[113, 112, 255]] },
  { name: "indigo-text-strong → var(--color-indigo-text-strong)", rgbs: [[159, 170, 235]] },
  { name: "search-mark → var(--color-search-mark-text)", rgbs: [[210, 218, 255]] },
  { name: "indigo-pale", rgbs: [[200, 210, 255], [205, 212, 255], [211, 215, 255]] },
  { name: "danger", rgbs: [[229, 72, 77], [236, 116, 116]] },
  {
    name: "success",
    rgbs: [
      [50, 185, 125],
      [73, 190, 146],
      [130, 230, 180],
      [151, 230, 198],
      [180, 235, 205],
      [165, 232, 200],
      [120, 190, 150],
      [139, 200, 180],
      [94, 180, 160],
      [180, 230, 210],
    ],
  },
  { name: "amber-source-warning", rgbs: [[244, 183, 49], [239, 180, 120], [239, 200, 150]] },
  { name: "amber-signal", rgbs: [[255, 179, 71]] },
  { name: "amber-hub", rgbs: [[212, 180, 120]] },
  {
    name: "amber-docs",
    rgbs: [
      [234, 198, 138],
      [224, 196, 140],
      [232, 200, 148],
      [238, 198, 128],
      [244, 196, 130],
    ],
  },
  { name: "surface-deep", rgbs: [[12, 14, 20], [14, 16, 22]] },
  {
    name: "kind-tone",
    rgbs: [
      [126, 134, 216],
      [74, 177, 196],
      [211, 159, 73],
      [124, 166, 141],
    ],
  },
];

/**
 * `HUE_FAMILIES` is a label set, not the pass/fail rule: a gate that knows only registered tuples
 * cannot see a new value. Only rgba with r === g === b passes (shadows, overlays); any hue, even
 * `rgba(15,16,17)`, needs a token.
 */
const FAMILY_BY_TUPLE = new Map(
  HUE_FAMILIES.flatMap(({ name, rgbs }) => rgbs.map((rgb) => [rgb.join(","), name])),
);

/** Only pure achromatics (r=g=b) pass this gate — the share belonging to shadows and overlays. */
function isAchromatic(r, g, b) {
  return r === g && g === b;
}

const RGBA_LITERAL = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,/g;

// Single sources of truth in contexts CSS variables cannot reach (canvas, WebGL,
// OG image). Each cited file states the reason in its own doc-block; a new
// exemption must leave the same evidence at the top of its file.
export const ALLOWLIST = new Set([
  // `shared/config/indigo-tokens.ts` needs no entry: it holds rgb triples as bare strings and
  // composes `rgba(` through a template, so the scan never matches it. A row that exempts nothing
  // blurs what the list forgives.
  "views/docs-vault/lib/popout-template.ts",
  // The two below are canvas files: `ctx.fillStyle` and `CanvasGradient.addColorStop` take strings
  // only and do not resolve `var()`, and alpha is computed per frame. They are near-achromatic but
  // not r=g=b (stars 236,236,240; vignette 3,3,4), so the automatic exemption does not apply.
  "widgets/ontology-map/render/starfield.ts",
  "widgets/ontology-map/render/grid.ts",
]);

/**
 * Exemption is one file plus a reason comment in `ALLOWLIST`, never a whole directory: skipping
 * `ontology-map` made a 0 mean either clean or not looked at. A canvas file that needs a raw
 * literal registers there; `starfield.ts` and `grid.ts` are the precedent.
 */
function shouldSkipDir(name) {
  return name === "node_modules";
}

/**
 * `.css` is scanned too: a stylesheet can hand-write an rgba identical to a token and not follow
 * when the token moves. The only legitimate home for a literal there is a token declaration, so
 * lines starting with `--token:` are skipped.
 */
function isTargetFile(name) {
  const ext = extname(name);
  if (ext !== ".ts" && ext !== ".tsx" && ext !== ".css") return false;
  return !name.includes(".test.");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (shouldSkipDir(entry)) continue;
      walk(full, out);
    } else if (isTargetFile(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `app/` is scanned too: `layout.tsx`, `global-error.tsx` (which replaces the root layout),
 * `opengraph-image.tsx` and routes are likely places to hand-write a colour.
 */
export const SCAN_ROOTS = [SRC_DIR, join(ROOT, "app")];

export function findRawColorLiterals(roots = SCAN_ROOTS) {
  const violations = [];
  const dirs = Array.isArray(roots) ? roots : [roots];
  const files = dirs.flatMap((d) => walk(d).map((f) => ({ file: f, root: d })));
  for (const { file, root } of files) {
    const rel = relative(root, file);
    if (ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    /*
     * Erase block comments wholesale, then count: a line-prefix test treats the middle lines of a
     * multi-line comment as code, and this file quotes the values while explaining why not to use
     * them. Newlines are kept so line numbers stay correct.
     */
    const scanned = content
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      /*
       * **The value of a custom-property declaration is the legitimate home for a
       * literal** — blocking that too would leave nowhere to write the value. But a
       * declaration **spans lines** (`--x: linear-gradient(\n  rgba(...),\n  ...\n);`),
       * so a line-prefix test misses everything from the second line on. Blank out from
       * the declaration start (`--name:`) through the `;`, preserving line numbers.
       */
      .replace(/--[a-zA-Z0-9-]+\s*:[^;]*;/g, (m) => m.replace(/[^\n]/g, " "));
    const lines = scanned.split("\n");
    /*
     * Reported paths are **repo-relative**. Prefixing `src/` by hand was correct while
     * only `src/` was walked, but now that `app/` is walked too the root has to be
     * visible. Outside the repository (a unit test's temp directory) the root-relative
     * path is used as is, so nothing prints starting with `../../..`.
     */
    const repoRel = relative(ROOT, file);
    const label = repoRel.startsWith("..") ? rel : repoRel;
    lines.forEach((line, i) => {
      /*
       * The line-prefix test is kept **in addition to** block removal — added, not
       * replaced. A JSDoc continuation line carrying only ` * ` with no opening `/*` in
       * the slice escapes the block regex, and this repository's comments really are
       * written that way.
       */
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // In a stylesheet the **only legitimate home for a literal is a token
      // declaration**: `--color-indigo-a40: rgba(94,106,210,0.4);` is where the value
      // lives, and everywhere else must call that name through `var()`.
      if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) return;
      for (const m of line.matchAll(RGBA_LITERAL)) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (isAchromatic(r, g, b)) continue;
        violations.push({
          file: label,
          line: i + 1,
          family: FAMILY_BY_TUPLE.get(`${r},${g},${b}`) ?? "unregistered",
          text: line.trim(),
        });
        break;
      }
    });
  }
  return violations;
}

function main() {
  const violations = findRawColorLiterals();
  if (violations.length === 0) {
    console.log("[check-no-raw-color] OK — no raw color rgba() literals found.");
    return;
  }
  console.error(
    `[check-no-raw-color] ${violations.length} raw color rgba() literal(s) found — use the matching var(--color-*) token instead:\n`,
  );
  for (const v of violations) {
    console.error(`  [${v.family}] ${v.file}:${v.line}  ${v.text}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
