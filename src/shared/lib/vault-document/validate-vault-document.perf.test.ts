import { expect, it } from "vitest";
import { startWorkClock } from "../../../../tests/helpers/work-clock";
import { summarizeVaultValidation } from "./validate-vault-document";

/*
 * Timed, not counted: the pairing runs over claims and issues the summary builds itself, so a
 * quadratic pass there reads no input the test could count.
 */

it("keeps paired identity-conflict reporting proportional to vault size", () => {
  const measure = (count: number) => {
    const items = Array.from({ length: count }, (_, i) => ({
      slug: `node-${i}`,
      frontmatter: {
        kind: "project", title: `Node ${i}`,
        uid: `00000000-0000-4000-8000-${Math.floor(i / 2).toString(16).padStart(12, "0")}`,
      },
    }));
    summarizeVaultValidation(items);
    const times = [];
    for (let run = 0; run < 5; run++) {
      const spent = startWorkClock();
      const result = summarizeVaultValidation(items);
      times.push(spent());
      expect(result.errorCount).toBe(count);
      expect(result.issuesBySlug).toHaveLength(count);
    }
    return times.sort((a, b) => a - b)[2];
  };
  const small = measure(2000), large = measure(16000);
  console.log(JSON.stringify({ smallCount: 2000, largeCount: 16000, smallMs: small, largeMs: large, ratio: large / small }));
  // Eight times the input/output; allow three times linear growth for allocator/GC noise.
  expect(large / small).toBeLessThan(24);
});
