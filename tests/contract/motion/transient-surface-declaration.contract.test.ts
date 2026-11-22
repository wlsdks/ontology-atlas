import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANCHORED_KINDS,
  FOCUSLESS_KINDS,
  TRANSIENT_SURFACE_ATTR,
  transientSurface,
  type TransientSurfaceKind,
} from "@/shared/ui/surfaces/transient-surface";

/**
 * The sweep in `tests/e2e/map/transient-surface-contract.spec.ts` measures only declared surfaces, so a
 * deleted declaration would pass silently. This locks the declaring-place count and kind vocabulary.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

const KINDS: readonly TransientSurfaceKind[] = ["anchored", "menu", "sheet", "notice", "hint"];

/** Source with comments stripped, so prose inside a comment is not mistaken for a declaration. */
const readCode = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(path) && !/\.test\./.test(path)) out.push(path);
  }
  return out;
}

const declaringFiles = walk(join(REPO_ROOT, "src"))
  .filter((path) => /transientSurface\(/.test(readCode(path)))
  .map((path) => relative(REPO_ROOT, path))
  .sort();

const declaredKinds = declaringFiles.flatMap((file) =>
  [...readCode(join(REPO_ROOT, file)).matchAll(/transientSurface\("([^"]+)"\)/g)].map(([, kind]) => kind),
);

/** Kinds the harness cannot measure, with the reason recorded. The list may shrink but not grow. */
const UNMEASURED_KINDS: Readonly<Record<string, string>> = {
  menu: "Opens only by right-clicking the canvas. In a browser with no vault picked, the panel over the map covers the canvas and the click times out after 120 s, and a synthetic PointerEvent never reaches the canvas pointer pipeline (measured 3 times on 2026-08-11). Delete this line once a harness that really attaches a vault exists.",
  hint: "Opens only on mouse hover. A pointer cannot be sent, for the same reason as above. Which coordinates hold a target is decided by the graph, so sweeping coordinates to force it open would report \"nothing there\" as a defect.",
};

describe("transient surface declaration contract", () => {
  /** The number of declaring places never falls below this floor. */
  it("the places that declare do not shrink", () => {
    expect(
      declaringFiles.length,
      `transient surface declarations shrank to ${declaringFiles.length} places, and the sweep does not look at the places that shrank:\n${declaringFiles.join("\n")}`,
    ).toBeGreaterThanOrEqual(7);
  });

  it("a kind name is one of five, since a typo is indistinguishable from \"no declaration\"", () => {
    expect(declaredKinds.length, "found no declaration at all, so this test spins idle").toBeGreaterThan(6);
    const unknown = [...new Set(declaredKinds)].filter((kind) => !KINDS.includes(kind as TransientSurfaceKind));
    expect(unknown, `unknown kinds: ${unknown.join(", ")}`).toEqual([]);
  });

  it("all five kinds are used, since a kind nobody uses is wrong information rather than a spec", () => {
    const used = new Set(declaredKinds);
    const unused = KINDS.filter((kind) => !used.has(kind));
    expect(unused, `unused kinds: ${unused.join(", ")}`).toEqual([]);
  });

  it("kinds that cannot receive focus and kinds that must stand beside are told apart", () => {
    // If these two sets become identical, splitting the kinds meant nothing.
    expect(FOCUSLESS_KINDS.length).toBeGreaterThan(0);
    expect(ANCHORED_KINDS.length).toBeGreaterThan(FOCUSLESS_KINDS.length);
    for (const kind of FOCUSLESS_KINDS) expect(KINDS).toContain(kind);
    for (const kind of ANCHORED_KINDS) expect(KINDS).toContain(kind);
    // A sheet that blocks what is behind it must take focus — trapping is that surface's job.
    expect(FOCUSLESS_KINDS).not.toContain("sheet");
  });

  it("the display name and the helper yield the same thing, leaving nothing to write by hand", () => {
    expect(TRANSIENT_SURFACE_ATTR).toBe("data-transient-surface");
    expect(transientSurface("notice")).toEqual({ "data-transient-surface": "notice" });
  });

  /**
   * Confirms the sweeping spec uses this marker as its selector. If the spec finds
   * surfaces another way (for example "the largest element"), this declaration becomes
   * decoration that does nothing — and that approach really did report 6 false
   * violations, which is why the marker exists.
   */
  /**
   * **Does every declared kind have a test that actually opens it** — and if not, is
   * the reason recorded? This is what makes the file worth having: attaching a marker
   * on its own protects nothing.
   */
  it("every kind is measured, or the reason it cannot be is written down", () => {
    const specs = readdirSync(join(REPO_ROOT, "tests/e2e"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => readCode(join(REPO_ROOT, "tests/e2e", f)))
      .join("\n");
    /*
     * The sweep reads kinds from the screen, so its code contains no kind strings. The
     * list the sweep declares it must open (`SWEEP_MUST_OPEN`) is therefore read as
     * well — that list is asserted at runtime inside the sweep, so it cannot be empty
     * words.
     */
    const sweepDeclared =
      readCode(join(REPO_ROOT, "tests/e2e/map/transient-surface-contract.spec.ts")).match(
        /const SWEEP_MUST_OPEN = \[([^\]]*)\]/,
      )?.[1] ?? "";
    const unexercised = KINDS.filter(
      (kind) =>
        !specs.includes(`data-transient-surface="${kind}"`) &&
        !sweepDeclared.includes(`"${kind}"`) &&
        !(kind in UNMEASURED_KINDS),
    );
    expect(
      unexercised,
      `kinds declared but opened by no test: ${unexercised.join(", ")}; write a test that opens them or give a reason in UNMEASURED_KINDS.`,
    ).toEqual([]);
  });

  it("each kind that cannot be measured is a live kind with a reason", () => {
    for (const [kind, reason] of Object.entries(UNMEASURED_KINDS)) {
      expect(KINDS, `.${kind} is not in the kind list, so it is a dead exemption`).toContain(kind as TransientSurfaceKind);
      expect(reason.length, `the reason for ${kind} is too short; it must answer why it cannot be measured`).toBeGreaterThan(40);
    }
  });

  it("the sweep finds surfaces by this marker", () => {
    const spec = readCode(join(REPO_ROOT, "tests/e2e/map/transient-surface-contract.spec.ts"));
    expect(spec, "the sweep does not use the declaration marker as a selector").toContain(`[${TRANSIENT_SURFACE_ATTR}]`);
    expect(spec, "the sweep does not measure the focus contract").toMatch(/tookFocus/);
  });
});
