import { expect, it } from "vitest";

import { resolveProjectLead } from "./project-lead";

it("reads a lead paragraph of unclosed brackets and a long heading in time proportional to its length", () => {
  const measure = (size: number) => {
    const body = `## a${" ".repeat(size)}b\n\n${"[".repeat(size / 2)}${"[[a|".repeat(size / 8)}`;
    resolveProjectLead(body);
    const times = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      expect(resolveProjectLead(body)).toHaveLength(size);
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[2];
  };
  const small = measure(40_000), large = measure(320_000);
  console.log(JSON.stringify({ smallMs: small, largeMs: large, ratio: large / small }));
  // Eight times the input; three times linear growth is allowed for allocator noise. Quadratic is 64.
  expect(large / small).toBeLessThan(24);
});
