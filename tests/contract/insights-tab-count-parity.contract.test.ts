import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INSIGHTS_CORES, ONTOLOGY_TABS } from "@/views/ontology-insights/lib/insights-tab-state";

/**
 * **The packaged app checks the insights board's shape, and cannot import the lists.**
 *
 * `scripts/lib/verify-macos/payload-contract.mjs` asserts how many subjects and how many
 * questions the WebView reported, because "one tab, one question" is a product rule and a
 * silently vanished entry is a real defect. That script is plain Node and the lists live in
 * TypeScript, so the numbers are written out by hand there.
 *
 * Measured 2026-08-26: adding the sixth tab left that number at five, and the mismatch surfaced
 * only after a full desktop bundle build and launch. Measured again 2026-09-19: splitting the row
 * in two left a single pinned tab count that **no landing can ever satisfy** — the board now opens
 * on the brief, which draws a subject radiogroup and no question tabs at all. This test puts both
 * failures in a unit run that finishes in milliseconds.
 *
 * It compares the two sides rather than pinning either. Both are allowed to change; they are not
 * allowed to disagree.
 */

const CONTRACT_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "lib",
  "verify-macos",
  "payload-contract.mjs",
);

function pinnedNumber(name: string): number {
  const source = readFileSync(CONTRACT_PATH, "utf8");
  const match = new RegExp(`const ${name} = (\\d+);`).exec(source);
  if (!match) {
    throw new Error(
      `${name} is gone from payload-contract.mjs — the app verification stopped checking the ` +
        "insights board, or the constant was renamed and this test is now watching nothing.",
    );
  }
  return Number(match[1]);
}

describe("insights board count parity", () => {
  it("reads real numbers from the desktop payload contract", () => {
    expect(pinnedNumber("INSIGHTS_SUBJECT_COUNT")).toBeGreaterThan(0);
    expect(pinnedNumber("INSIGHTS_ONTOLOGY_TAB_COUNT")).toBeGreaterThan(0);
  });

  it("matches the subject row the app actually renders", () => {
    expect(
      pinnedNumber("INSIGHTS_SUBJECT_COUNT"),
      `The desktop verification expects ${pinnedNumber("INSIGHTS_SUBJECT_COUNT")} insights ` +
        `subjects and the app renders ${INSIGHTS_CORES.length} (${INSIGHTS_CORES.join(", ")}). ` +
        "Update INSIGHTS_SUBJECT_COUNT in scripts/lib/verify-macos/payload-contract.mjs.",
    ).toBe(INSIGHTS_CORES.length);
  });

  it("matches the question row the concepts subject actually renders", () => {
    expect(
      pinnedNumber("INSIGHTS_ONTOLOGY_TAB_COUNT"),
      `The desktop verification expects ${pinnedNumber("INSIGHTS_ONTOLOGY_TAB_COUNT")} concept ` +
        `questions and the app renders ${ONTOLOGY_TABS.length} (${ONTOLOGY_TABS.join(", ")}). ` +
        "Update INSIGHTS_ONTOLOGY_TAB_COUNT in scripts/lib/verify-macos/payload-contract.mjs.",
    ).toBe(ONTOLOGY_TABS.length);
  });

  it("names the subject whose testId the contract branches on", () => {
    const source = readFileSync(CONTRACT_PATH, "utf8");
    const match = /const INSIGHTS_ONTOLOGY_SUBJECT = "([^"]+)";/.exec(source);
    expect(match?.[1]).toBe("insights-core-ontology");
    expect(INSIGHTS_CORES).toContain("ontology");
  });
});
