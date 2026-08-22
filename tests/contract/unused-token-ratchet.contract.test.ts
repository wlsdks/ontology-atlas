import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The docs mirror **contains the repository's own prose**, so token names appear
 * there as explanation. Counting that as consumption keeps a dead token alive
 * forever on the strength of its own documentation — this one distinction was the
 * difference between 106 and 231.
 */
const GENERATED_MIRRORS = ["src/entities/docs-vault/data/", "public/docs-vault/"];

function repoFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "src", "app", "mcp", "cli", "scripts", "tests", "src-tauri"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|css|rs|html)$/.test(f))
    .filter((f) => f !== "app/globals.css")
    .filter((f) => !GENERATED_MIRRORS.some((dir) => f.startsWith(dir)))
    // `git ls-files` answers from **the index** — a deleted but uncommitted file is
    // still listed. If the gate died trying to read a missing file, then mid-refactor
    // this test would go red because of **itself**, not because of a token.
    .filter((f) => existsSync(f));
}

/**
 * A change that **lowers** this number is welcome; lower this baseline with it.
 * To raise it, state in the PR body why it is needed now.
 */
const BASELINE_UNUSED = 0;

describe("디자인 토큰 — 아무도 안 쓰는 선언이 늘지 않는다", () => {
  it("keeps the unused-token count at or below the recorded baseline", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const stripped = stripCssComments(css);

    const declared = new Map<string, number>();
    for (const m of stripped.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:/gm)) {
      declared.set(m[1], (declared.get(m[1]) ?? 0) + 1);
    }
    const mentionsInCss = new Map<string, number>();
    for (const m of stripped.matchAll(/--[a-zA-Z0-9_-]+/g)) {
      mentionsInCss.set(m[0], (mentionsInCss.get(m[0]) ?? 0) + 1);
    }

    const mentionedOutside = new Set<string>();
    const bodies: string[] = [];
    for (const file of repoFiles()) {
      const text = readFileSync(file, "utf8");
      bodies.push(text);
      for (const m of text.matchAll(/--[a-zA-Z0-9_-]+/g)) mentionedOutside.add(m[0]);
    }
    const allText = bodies.join("\n");

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
    const usedAsUtility = (token: string): boolean => {
      for (const [prefix, utils] of Object.entries(UTILITY_NAMESPACES)) {
        if (!token.startsWith(prefix)) continue;
        const stem = token.slice(prefix.length);
        return utils.some((u) =>
          new RegExp(`(?<![\\w-])${u}-${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(allText),
        );
      }
      return false;
    };

    const unused: string[] = [];
    for (const [token, declarationCount] of declared) {
      if (INVISIBLE_BY_MECHANISM.has(token)) continue;
      if (token.endsWith(COMPANION_SUFFIX)) continue;
      if (mentionedOutside.has(token)) continue;
      // Another token's value citing this one inside globals.css counts as consumption.
      if ((mentionsInCss.get(token) ?? 0) > declarationCount) continue;
      if (usedAsUtility(token)) continue;
      unused.push(token);
    }
    unused.sort();

    expect(
      unused.length,
      `아무도 안 쓰는 토큰이 baseline(${BASELINE_UNUSED})보다 늘었다. 정의만 있고\n` +
        `소비가 없는 토큰은 규격이 아니라 오정보다 — 다음 사람이 그 값을 믿는다.\n` +
        `쓸 곳과 함께 넣거나, 안 쓸 거면 넣지 마라. 지금 잉여:\n  ${unused.join("\n  ")}`,
    ).toBeLessThanOrEqual(BASELINE_UNUSED);
  });

  /**
   * **A probe against the detector going silently inert.** If the check above breaks
   * into passing everything for any reason (a regex typo, a missing namespace
   * addition), a baseline of 0 is satisfied forever and nobody knows. So "does
   * inserting one fake token get caught" is verified directly here.
   */
  it("actually detects an unused token — the probe", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const probed = css.replace(":root {", ":root {\n  --probe-nobody-uses-this: 1px;");
    const stripped = stripCssComments(probed);
    const declared = [...stripped.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9_-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared).toContain("--probe-nobody-uses-this");

    const mentions = [...stripped.matchAll(/--probe-nobody-uses-this/g)].length;
    // One declaration = one mention. Any consumption makes it 2 or more.
    expect(mentions).toBe(1);
  });
});
