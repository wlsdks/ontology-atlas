import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INSIGHTS_TABS } from "@/views/ontology-insights/lib/insights-tab-state";

/**
 * **The packaged app checks the tab count, and cannot import the list.**
 *
 * `scripts/lib/verify-macos/payload-contract.mjs` asserts how many insights tabs
 * the WebView reported, because "one tab, one question" is a product rule and a
 * silently vanished tab is a real defect. That script is plain Node and the list
 * lives in TypeScript, so the number is written out by hand there.
 *
 * Measured 2026-08-26: adding the sixth tab left that number at five, and the
 * mismatch surfaced only after a full desktop bundle build and launch. This test
 * puts the same failure in a unit run that finishes in milliseconds.
 *
 * It compares the two sides rather than pinning either. Both are allowed to
 * change; they are not allowed to disagree.
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

function pinnedTabCount(): number {
  const source = readFileSync(CONTRACT_PATH, "utf8");
  const match = /const INSIGHTS_TAB_COUNT = (\d+);/.exec(source);
  if (!match) {
    throw new Error(
      "INSIGHTS_TAB_COUNT is gone from payload-contract.mjs — the app verification " +
        "stopped checking the tab count, or the constant was renamed and this test " +
        "is now watching nothing.",
    );
  }
  return Number(match[1]);
}

describe("insights tab count parity", () => {
  it("reads a real number from the desktop payload contract", () => {
    expect(pinnedTabCount()).toBeGreaterThan(0);
  });

  it("matches the tab list the app actually renders", () => {
    expect(
      pinnedTabCount(),
      `The desktop verification expects ${pinnedTabCount()} insights tabs and the app ` +
        `renders ${INSIGHTS_TABS.length} (${INSIGHTS_TABS.join(", ")}). Update ` +
        "INSIGHTS_TAB_COUNT in scripts/lib/verify-macos/payload-contract.mjs.",
    ).toBe(INSIGHTS_TABS.length);
  });
});
