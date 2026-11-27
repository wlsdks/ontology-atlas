import { expect, it } from "vitest";
import { startWorkClock } from "../../../../tests/helpers/work-clock";
import { comparableCode } from "./comparable-code.mjs";

/*
 * Timed, not counted: the risk is backtracking or a rescan the scanner's own loops hide, so
 * there is no call to count. Each input below once took time far beyond linear: a local export
 * list with a comment per name backtracked exponentially (6 names, 34 s, 2026-11-27 review), a
 * one-line YAML flow map re-read its prefix at every quote, and a long JSX line re-read its rest
 * at every `//`.
 */

const SHAPES: Record<string, { path: string; build: (count: number) => string }> = {
  "export list with a comment per name": {
    path: "src/index.ts",
    build: (count) => `export {\n${Array.from({ length: count }, (_, i) => `  name${i}, // why this one is public\n`).join("")}};\n`,
  },
  "one-line YAML flow map": {
    path: "a.yml",
    build: (count) => `{${Array.from({ length: count }, (_, i) => `"k${i % 100}": "v${i % 100}"`).join(", ")}}\n`,
  },
  "one long JSX line of // text": {
    path: "a.tsx",
    build: (count) => `const a = <p>${"see it // later ".repeat(count)}</p>;\n`,
  },
};

it.each(Object.entries(SHAPES))("normalizes a %s in time proportional to its length", (_name, shape) => {
  const measure = (count: number) => {
    const text = shape.build(count);
    comparableCode(text, shape.path);
    const times = [];
    for (let run = 0; run < 5; run++) {
      const spent = startWorkClock();
      comparableCode(text, shape.path);
      times.push(spent());
    }
    return times.sort((a, b) => a - b)[2];
  };
  const small = measure(2000), large = measure(16000);
  console.log(JSON.stringify({ shape: _name, smallCount: 2000, largeCount: 16000, smallMs: small, largeMs: large, ratio: large / small }));
  // Eight times the input; allow three times linear growth for allocator and collector noise.
  expect(large / small).toBeLessThan(24);
});
