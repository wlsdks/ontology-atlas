import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Every token `docs/DESIGN-SYSTEM.md` cites must exist in `app/styles`.
 *
 * The document used to cite hundreds of tokens of screens that no longer exist, and a
 * ratchet only stopped the count from growing. Values now come from `pnpm design:tokens`,
 * the document names a token only to state a rule about it, and the ceiling is zero.
 *
 * A name counts only inside backticks or `var(...)`. A prefix that ends in a dash names a
 * family, and a shell command (`pnpm ...`, `git ...`, `rg ...`) names flags, not tokens.
 */

const ROOT = process.cwd();
const CSS = readGlobalCss();
const DOC = readFileSync(path.join(ROOT, "docs/DESIGN-SYSTEM.md"), "utf8");

const COMMAND_SPAN = /^\s*(?:pnpm|git|rg|node)\s/;

function definedTokens(): Set<string> {
  return new Set([...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

function tokensIn(text: string): string[] {
  return [...text.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]).filter((t) => !t.endsWith("-"));
}

function citedTokens(doc: string): Set<string> {
  const out = new Set<string>();
  for (const m of doc.matchAll(/`([^`\n]{0,200}?)`/g)) {
    if (!COMMAND_SPAN.test(m[1])) for (const t of tokensIn(m[1])) out.add(t);
  }
  for (const m of doc.matchAll(/var\(([^)\n]*)\)/g)) for (const t of tokensIn(m[1])) out.add(t);
  return out;
}

describe("design document token references", () => {
  const defined = definedTokens();
  const cited = citedTokens(DOC);
  const missing = [...cited].filter((t) => !defined.has(t)).sort();

  it("reads both sides, so a green result is not an empty one", () => {
    expect(defined.size, "no tokens were read from the stylesheet").toBeGreaterThan(400);
    expect(cited.size, "no token citations were read from the document").toBeGreaterThan(20);
  });

  it("cites no token that does not exist", () => {
    expect(
      missing,
      "The document names a token that is not declared in app/styles. Declare it in `app/styles/tokens.css` first, or print the real name with `pnpm design:tokens -- --prefix=<name>`.",
    ).toEqual([]);
  });

  it("probe: a prefix is not a name, a command is not a citation, a missing token is caught", () => {
    expect([...citedTokens("`--chrome-` family")]).toEqual([]);
    expect([...citedTokens("`pnpm design:tokens -- --prefix=--text-`")]).toEqual([]);
    expect([...citedTokens("`--color-indigo-a12` and var(--motion-fast)")].sort()).toEqual([
      "--color-indigo-a12",
      "--motion-fast",
    ]);
    const fake = "--this-token-does-not-exist-anywhere";
    expect(defined.has(fake)).toBe(false);
    expect([...citedTokens(`\`${fake}\``)].filter((t) => !defined.has(t))).toEqual([fake]);
  });
});
