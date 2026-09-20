import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **A guide step's anchor must name a testid some screen actually carries.**
 *
 * A destination guide is two pages: what the screen is for, then one thing on it
 * (`tour-steps.ts`). The second page is drawn only when its anchor resolves —
 * `computeVisibleSteps` drops a step whose element is absent, which is the right
 * behaviour for a surface that is collapsed right now, and the *wrong* one when the
 * testid was renamed or deleted: the guide quietly becomes one page and nothing says so.
 *
 * That is exactly what happened to Insights. `do-next-touchups` was a grouping the
 * 2026-09-06 "one list, one total" round removed — `DoNextTab.test.tsx` even asserts it is
 * gone — and the anchor kept naming it, so the second page never appeared again. No test
 * failed, because every test in the chain was about something else.
 *
 * So the gate reads the anchors out of the source rather than holding its own copy of them:
 * a new guide is covered the day it is written, without anybody registering it here.
 *
 * **What it cannot see**: a testid built at runtime (`data-testid={`brief-core-${x}`}`).
 * Anchoring a guide to one of those needs a different proof, and the failure message says
 * so rather than pretending the element does not exist.
 */

const TOUR_STEPS_FILE = join(process.cwd(), "src/features/guided-tour/model/tour-steps.ts");

/** Every `{ type: "testid", value: "…" }` anchor in the tour definitions, in file order. */
function tourAnchorTestids(): string[] {
  const source = readFileSync(TOUR_STEPS_FILE, "utf8");
  const pattern = /type:\s*"testid",\s*value:\s*"([^"]+)"/g;
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) found.push(match[1]!);
  return found;
}

/** Every literal `data-testid="…"` rendered by product source (tests excluded). */
function renderedTestids(): Set<string> {
  const stack = [join(process.cwd(), "src")];
  const found = new Set<string>();
  let scanned = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        stack.push(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      scanned += 1;
      const text = readFileSync(full, "utf8");
      for (const match of text.matchAll(/data-testid="([^"]+)"/g)) found.add(match[1]!);
    }
  }
  // A walk that died reports "nothing to check" as a pass, so the floor is asserted first.
  if (scanned < 200) throw new Error(`source walk stopped at ${scanned} files — it is broken`);
  return found;
}

describe("guided tour anchors", () => {
  const anchors = tourAnchorTestids();
  const rendered = renderedTestids();

  it("names enough anchors to be worth checking", () => {
    // Eleven testid anchors on 2026-09-21. A parser that quietly matched none would make
    // every case below vacuous, so the count is the gate's own liveness check.
    expect(anchors.length).toBeGreaterThanOrEqual(10);
  });

  for (const testid of new Set(anchors)) {
    it(`${testid} is rendered somewhere under src/`, () => {
      expect(
        rendered.has(testid),
        `No screen renders data-testid="${testid}", so the guide step anchored to it is ` +
          `dropped and its page never shows. Point the anchor at the testid that carries ` +
          `that thing now, or remove the step. If the testid is built at runtime, the ` +
          `anchor needs a literal one to resolve against.`,
      ).toBe(true);
    });
  }
});
