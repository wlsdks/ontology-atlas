import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A guide step anchor must name a testid some screen renders: `computeVisibleSteps` drops a step
 * whose element is absent, so a renamed testid silently shortens the guide. Anchors are read from
 * source. A testid built at runtime cannot be seen here.
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

/**
 * Every literal testid rendered by product source. Two spellings reach the DOM: `data-testid` and the
 * `testId` prop that shared primitives forward; both must be scanned.
 */
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
      for (const match of text.matchAll(/\btestId="([^"]+)"/g)) found.add(match[1]!);
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
    // A parser that matched none would make every case below vacuous, so the count is its liveness check.
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
