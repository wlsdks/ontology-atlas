#!/usr/bin/env node
// Colour-tokenisation regression gate (2026-07-20).
//
// Mechanically enforces the design charter — "every colour goes through a CSS
// variable; no hardcoded hex" (`.claude/rules/design.md`) — across every chromatic
// hue this project has tokenised. It replaced `check-no-raw-indigo.mjs`, which
// covered only two indigos, by widening scope to the full chromatic inventory:
// signal tones (success emerald, amber warning/source) plus the kind-tone hues.
//
// The only exemption is `ALLOWLIST` — JS constant sources in contexts CSS
// variables cannot reach (canvas, WebGL, OpenGraph), each with its reason in that
// file's own doc-block.
//
// Registered as `pnpm check:tokens`.

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
  // Registered 2026-08-04 — the audit found these three hand-written as literals,
  // and all three now have tokens. They are listed here **to name which token to
  // use**; the verdict itself is already made by the achromatic rule below.
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
      [105, 177, 121],
      [196, 92, 92],
    ],
  },
];

/**
 * `HUE_FAMILIES` is now a **label set, not the verdict** (inverted 2026-08-04).
 *
 * **Why it was inverted — a gate that only knows registered tuples cannot see a
 * new value.** The old verdict was "a literal exactly matching an rgb tuple in the
 * list above", and in that shape **everything off the list passes** — a genuinely
 * new colour and a hand-copied existing token pass alike. Measured 2026-08-04:
 * with `pnpm check:tokens` reporting OK, **26** raw rgba literals were alive,
 * among them
 *
 *   - `rgba(113,112,255,·)` ×3 — `--color-indigo-accent` (#7170ff) written by hand
 *   - `rgba(159,170,235,0.95)` ×2 — **byte-identical** to `--color-indigo-text-strong`
 *   - `rgba(210,218,255,0.98)` ×3 — a pale indigo with **no corresponding token at all**
 *
 * None of them follow when the token moves.
 *
 * **The current verdict — an allowlist of achromatics, not a denylist.** Only rgba
 * with `r === g === b` passes. Such values are shadows and overlays
 * (black/white/grey), not palette colours, and **other gates** own those (the
 * shadow ramp, `--color-overlay-*`). Anything with any hue mixed in — even
 * something that reads grey to the eye, like `rgba(15,16,17)` — must go through a
 * token. The near-achromatic surface literals the old rule missed
 * (`rgba(11,12,14,0.98)` and similar) sat in exactly that gap.
 *
 * ⚠️ **Inventory before switching on** (`/gate-probe`): under the inverted verdict
 * the violations are 2 in `starfield.ts` and 2 in `grid.ts`, all four canvas, all
 * four going to `ALLOWLIST`. So this change moves 0 pixels and leaves 0 residual
 * violations; what it blocks is **every colour hand-written from here on**.
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
// OG image, tone.ts). Each cited file states the reason in its own doc-block; a new
// exemption must leave the same evidence at the top of its file.
export const ALLOWLIST = new Set([
  // `shared/config/indigo-tokens.ts` **left this list** on 2026-08-04. Under the
  // inverted verdict it needs no exemption: it holds rgb triples as bare strings like
  // `"94, 106, 210"` and composes `rgba(` through a template, so the scan never
  // matches it. Leaving a row that exempts nothing blurs what the list actually
  // forgives (gate: "every ALLOWLIST entry actually contains a literal", below).
  "views/docs-vault/lib/popout-template.ts",
  // tone.ts — the single source for kind datamarks. Canvas fillStyle consumes the
  // computed rgba string directly, so it cannot become a var() (Design Guardian
  // verdict §② "kind-tone: CLEAN — tone.ts is already the sanctioned kind-tone
  // source").
  "entities/ontology-class/model/tone.ts",
  // The two below are the canvas files the 2026-08-04 inversion (achromatics only)
  // caught for the first time. `ctx.fillStyle` and `CanvasGradient.addColorStop`
  // take **strings only** and do not resolve `var()` — a 2D context is not the DOM,
  // so there is no cascade. Alpha is computed per frame, so a single token cannot
  // fold them either. Both are very close to achromatic but not exactly r=g=b
  // (stars 236,236,240 · vignette 3,3,4), so the automatic exemption does not apply.
  // The same reason is in each file's doc-block.
  "widgets/topology-map-v2/render/starfield.ts",
  "widgets/topology-map-v2/render/grid.ts",
]);

/**
 * **Directory-wide exemption is not this repository's spec** — an exemption is one
 * file plus a reason comment, and that is `ALLOWLIST`.
 *
 * This used to skip all of `topology-map-v2` (the canvas engine). The reason was
 * legitimate: canvas `fillStyle` cannot take `var()`. But **exempting a whole
 * directory means nobody knows what grows inside it** — 59 files had never once
 * been checked, and there was no way to tell a 0 that means "clean" from a 0 that
 * means "not looked at".
 *
 * ⚠️ **Inventory before switching on** (`/gate-probe`, `design-system-audit` §4):
 * with the skip removed, that directory's violations are **0** (measured
 * 2026-08-04 — the only rgba literals in non-test files are `rgba(3,3,4)` ×2 and
 * `rgba(236,236,240)` ×2, none of which is in any `HUE_FAMILIES`). So this change
 * moves 0 pixels and leaves 0 violations; it blocks only **future re-entry**.
 *
 * If a canvas file genuinely needs a raw literal, register it in `ALLOWLIST` as
 * **one file plus the reason in that file's doc-block** — `tone.ts` is the
 * precedent.
 */
function shouldSkipDir(name) {
  return name === "node_modules";
}

/**
 * **`.css` is scanned too** (2026-08-05).
 *
 * This used to look at `.ts`/`.tsx` only, and in that gap `::selection` in
 * `app/globals.css` hand-wrote an rgba **byte-identical** to `--color-indigo-a40`
 * — whose name already existed 3,600 lines above. When the token moves, that one
 * line does not follow.
 *
 * In a stylesheet the **only legitimate home for a literal is a token
 * declaration**, so `findRawColorLiterals` below skips lines starting with
 * `--token:`.
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
 * **`app/` is scanned too** (2026-08-05).
 *
 * This used to walk `src/` only. `app/` holds `layout.tsx`, `global-error.tsx`
 * (which **replaces** the root layout), `opengraph-image.tsx`, and 10 routes — the
 * places structurally most likely to hand-write a colour were entirely outside.
 * The sibling gate `design-forbidden-class-guard` already walked `['src','app']`,
 * so the asymmetry was an omission, not a decision.
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
     * **Erase block comments wholesale** (corrected 2026-08-05).
     *
     * This used to check only whether a line **starts** with `//`, `*`, or `/*`, so
     * the **middle lines** of a multi-line comment (unindented, or starting with a
     * non-ASCII word) were treated as code. This file itself quotes the values while
     * explaining why they must not be used, so the moment scope widened to `.css`,
     * **three of its own explanatory lines were reported as violations**.
     *
     * The same disease appeared four times in this round alone (`unused-token-ratchet`
     * under-counting, `implicit-bold-weight` over-counting, `named-offramp`
     * over-counting, and here). A line-prefix test cannot beat block comments — erase
     * them, then count. Newlines are kept so line numbers stay correct.
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
