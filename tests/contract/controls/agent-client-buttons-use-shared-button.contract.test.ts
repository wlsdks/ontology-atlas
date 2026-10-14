import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The tool-connect button row must use the shared primitive, not reimplement it: value lint cannot
 * see a missing focus ring. Render results live in `AgentClientButtons.test.tsx`.
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

describe("AgentClientButtons goes through a shared control primitive", () => {
  /*
   * The row actions use `Chip` at `lg` like sibling Agents rows; `controlClass` carries the focus
   * ring.
   */
  it("imports the shared control primitive", () => {
    expect(source).toMatch(/from ["']@\/shared\/ui\/controls\/controls["']/);
    expect(code).toMatch(/<Chip\b/);
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
    const primitive = readFileSync("src/shared/ui/control-class.ts", "utf8");
    expect(primitive).toContain("focus-visible:ring-2");
    expect(primitive).toContain("--color-indigo-focus-ring");
    // A consumer rewriting its own focus style defeats the point of going through the primitive.
    expect(code).not.toContain("focus-visible:outline-none");
  });
});
