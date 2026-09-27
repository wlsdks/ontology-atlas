import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';
import { blankComments } from '../../scripts/quality/source-language/inventory.mjs';

/**
 * The reverse-direction gate for **tokens that are defined but nobody uses.**
 *
 * `undeclared-token-ref.contract.test.ts` guards the forward direction: it fails
 * when a `var()` points at a token that does not exist. This file guards the
 * reverse: a token declared and used by nobody is **misinformation, not a spec**.
 * The precedent is 2026-07-26, when two dead tokens (`--pad-card`/`--pad-panel`)
 * held **different values** from the panel's actual ones.
 *
 * ## Why a ratchet rather than 0
 *
 * As this file's own comments say, an alpha ladder is sometimes laid down as a set
 * **before the components that will use it** ("adding high-frequency orphan alphas
 * from the colour inventory"). That is legitimate design-system practice, so
 * forcing 0 would punish it. Instead it fails **when the count grows** — the same
 * form as the procedure this repository already uses (measure → classify → confirm
 * it fits one PR → gate), and a sibling of the `type-ramp-coverage` ratchet.
 *
 * ## Why a contract test rather than lint
 *
 * The verdict needs **the full value list of other files**. `no-restricted-syntax`
 * is an AST selector over one file and cannot express "nowhere in the repository
 * uses this token".
 *
 * ## The three invisible consumption paths
 *
 * These can never be found by text search, so they are excluded via an allowlist.
 * When adding to that list, also record **why text search cannot see it** — "looks
 * unused but I was afraid to remove it" is not a reason.
 */

/** Consumed by the framework or a third party without naming the token. */
const INVISIBLE_BY_MECHANISM = new Set<string>([
  // A framework hook Tailwind v4 **reads by name**. Its mere existence changes the
  // default for roughly 500 unqualified `transition-*` utilities. No code writes this
  // name.
  "--default-transition-duration",
  "--default-transition-timing-function",
]);

/** `--text-<step>--line-height` is the partner `text-<step>` loads at compile time. */
const COMPANION_SUFFIX = "--line-height";

// Tailwind namespace → the utility prefix that token generates. `--color-panel` is
// alive even when it is only used as `bg-panel`, with no `var()`.
const UTILITY_NAMESPACES: Record<string, readonly string[]> = {
  "--color-": ["bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via", "outline", "decoration", "accent", "caret", "shadow", "divide", "placeholder"],
  "--text-": ["text"],
  "--tracking-": ["tracking"],
  "--leading-": ["leading"],
  "--radius-": ["rounded"],
  "--font-weight-": ["font"],
  "--font-": ["font"],
  "--shadow-": ["shadow"],
  "--ease-": ["ease"],
  "--animate-": ["animate"],
};

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The docs mirror **contains the repository's own prose**, so token names appear
 * there as explanation. Counting that as consumption keeps a dead token alive
 * forever on the strength of its own documentation — this one distinction was the
 * difference between 106 and 231. A comment is the same prose inside a source file.
 */
const GENERATED_MIRRORS = ["src/entities/docs-vault/data/", "public/docs-vault/"];

function repoFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "src", "app", "mcp", "cli", "scripts", "tests", "src-tauri"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|css|rs|html)$/.test(f))
    .filter((f) => f !== "app/globals.css" && !f.startsWith("app/styles/"))
    .filter((f) => !GENERATED_MIRRORS.some((dir) => f.startsWith(dir)))
    // Include new, untracked source owners during a refactor. A deleted but uncommitted file is
    // still listed. If the gate died trying to read a missing file, then mid-refactor
    // this test would go red because of **itself**, not because of a token.
    .filter((f) => existsSync(f));
}

type Source = { path: string; text: string };

/** Every `--token` a text names, and every whole utility-shaped class such as `bg-panel`. */
function namesIn(text: string): string[] {
  return [
    ...Array.from(text.matchAll(/--[a-zA-Z0-9_-]+/g), (m) => m[0]),
    ...Array.from(text.matchAll(/(?<![\w-])[a-z]+-[\w-]+/g), (m) => m[0]),
  ];
}

function unusedTokens(css: string, sources: readonly Source[]): { declared: number; unused: string[] } {
  const stripped = stripCssComments(css);
  const declared = new Map<string, number>();
  for (const m of stripped.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:/gm)) {
    declared.set(m[1], (declared.get(m[1]) ?? 0) + 1);
  }
  const mentionsInCss = new Map<string, number>();
  for (const m of stripped.matchAll(/--[a-zA-Z0-9_-]+/g)) {
    mentionsInCss.set(m[0], (mentionsInCss.get(m[0]) ?? 0) + 1);
  }
  const utilitiesOf = new Map<string, string[]>();
  for (const token of declared.keys()) {
    const namespace = Object.entries(UTILITY_NAMESPACES).find(([prefix]) => token.startsWith(prefix));
    if (namespace) utilitiesOf.set(token, namespace[1].map((u) => `${u}-${token.slice(namespace[0].length)}`));
  }
  const wanted = new Set([...declared.keys(), ...[...utilitiesOf.values()].flat()]);

  // Blanking comments parses the file, so a file whose text names nothing wanted skips it:
  // blanking only removes text, so its code names nothing either.
  const read = new Set<string>();
  for (const { path, text } of sources) {
    if (!namesIn(text).some((name) => wanted.has(name))) continue;
    for (const name of namesIn(blankComments(path, text))) read.add(name);
  }

  const unused: string[] = [];
  for (const [token, declarationCount] of declared) {
    if (INVISIBLE_BY_MECHANISM.has(token)) continue;
    if (token.endsWith(COMPANION_SUFFIX)) continue;
    if (read.has(token)) continue;
    // Another token's value citing this one inside globals.css counts as consumption.
    if ((mentionsInCss.get(token) ?? 0) > declarationCount) continue;
    if (utilitiesOf.get(token)?.some((utility) => read.has(utility))) continue;
    unused.push(token);
  }
  return { declared: declared.size, unused: unused.sort() };
}

/**
 * A change that **lowers** this number is welcome; lower this baseline with it.
 * To raise it, state in the PR body why it is needed now.
 */
const BASELINE_UNUSED = 0;

describe("design tokens: declarations no code reads do not grow", () => {
  it("keeps the unused-token count at or below the recorded baseline", () => {
    const sources = repoFiles().map((path) => ({ path, text: readFileSync(path, "utf8") }));
    const { declared, unused } = unusedTokens(readGlobalCss(), sources);
    expect(sources.length, "the scan read no source files").toBeGreaterThan(1000);
    expect(declared, "the stylesheet declared no tokens").toBeGreaterThan(100);
    expect(
      unused.length,
      `Tokens no code reads grew past the baseline (${BASELINE_UNUSED}). A token that is\n` +
        `declared and never consumed is misinformation, not a spec: the next person trusts its value.\n` +
        `Add it together with its consumer, or do not add it. Unused now:\n  ${unused.join("\n  ")}`,
    ).toBeLessThanOrEqual(BASELINE_UNUSED);
  });

  /**
   * **A probe against the detector going silently inert.** If the check above breaks
   * into passing everything for any reason (a regex typo, a missing namespace
   * addition), a baseline of 0 is satisfied forever and nobody knows. So "does
   * inserting one fake token get caught" is verified directly here.
   */
  it("actually detects an unused token — the probe", () => {
    const probed = readGlobalCss().replace(":root {", ":root {\n  --probe-nobody-uses-this: 1px;");
    expect(unusedTokens(probed, []).unused).toContain("--probe-nobody-uses-this");
  });

  it("does not count a comment as a consumer — the probe", () => {
    const css = [
      ":root {",
      "  --probe-line-comment: 1px;",
      "  --probe-jsx-comment: 1px;",
      "  --color-probe-utility-comment: #000;",
      "  --probe-read-by-code: 1px;",
      "  --color-probe-utility-code: #000;",
      "}",
    ].join("\n");
    const sources = [
      { path: "probe.ts", text: "// --probe-line-comment is named here and read nowhere.\nexport const read = 'var(--probe-read-by-code)';\n" },
      {
        path: "probe.tsx",
        text: 'export const Probe = () => <div className="bg-probe-utility-code">{/* --probe-jsx-comment bg-probe-utility-comment */}</div>;\n',
      },
    ];
    expect(unusedTokens(css, sources).unused).toEqual([
      "--color-probe-utility-comment",
      "--probe-jsx-comment",
      "--probe-line-comment",
    ]);
  });
});
