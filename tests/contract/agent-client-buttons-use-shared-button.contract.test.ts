import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The tool-connect button row **goes through the primitive** (2026-08-02, design
 * council S3).
 *
 * **What was there** (exhaustive measurement). `src/shared/ui/button.tsx` already
 * has a `variant: primary | ghost | outline` cva, and `primary` uses the opaque
 * `--color-indigo-brand` (#5e6ad2). `AgentClientButtons` did not use it and instead
 * **reimplemented its own**, with the translucent `--color-indigo-a24` wash. That
 * wash appeared 24 times across 19 files with **0** of them going through the
 * `Button` primitive — a spec nobody uses is a document, not a spec.
 *
 * The same reimplementation **also omitted the focus-visible ring**: these were the
 * only buttons on the screen with no `focus-visible:ring`, so the browser default
 * `outline: rgb(208,214,224) auto 1px` appeared, while nine or more other places in
 * the app used the indigo ring token. Using the primitive brings that along
 * automatically.
 *
 * **What this gate locks.** Value lint cannot see this defect — everything the
 * reimplementation used is a legitimate token and breaks no value rule. And **what is
 * absent leaves no literal**: a missing focus ring is outside the hardcoded-value
 * check's field of view. So this measures whether the primitive was used, not which
 * tokens were used.
 *
 * The render results (whether the four share a weight, whether any glyph lacks a
 * state) are measured by the sibling unit test
 * `src/features/docs-vault-local/ui/AgentClientButtons.test.tsx`.
 */

const SOURCE = "src/features/docs-vault-local/ui/AgentClientButtons.tsx";
const source = readFileSync(SOURCE, "utf8");

/**
 * The body with comments removed. **Why**: this file's comments record what was
 * removed by naming the token, so measuring without stripping them reads the record
 * of the cleanup as a violation. When a value gate measures prose, the next person
 * passes it by deleting the explanation.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("AgentClientButtons 는 shared/ui/button 을 통과한다", () => {
  it("imports the shared button primitive", () => {
    expect(source).toMatch(/from ["']@\/shared\/ui\/button["']/);
    expect(source).toMatch(/\bbuttonVariants\b/);
  });

  it("no longer declares the bespoke ClientButton reimplementation", () => {
    expect(code).not.toMatch(/function\s+ClientButton\b/);
    expect(code).not.toMatch(/<ClientButton\b/);
  });

  it("carries no translucent indigo wash imitating the primitive's filled variant", () => {
    // The real defect is this value, not the name — rename it while leaving the wash and
    // the check above passes with the screen unchanged.
    expect(code).not.toContain("--color-indigo-a24");
    expect(code).not.toContain("--color-indigo-a32");
  });

  it("gets the app's focus ring from the primitive rather than the browser default", () => {
    const primitive = readFileSync("src/shared/ui/button.tsx", "utf8");
    expect(primitive).toContain("focus-visible:ring-2");
    expect(primitive).toContain("--color-indigo-accent");
    // A consumer rewriting its own focus style defeats the point of going through the primitive.
    expect(code).not.toContain("focus-visible:outline-none");
  });
});
