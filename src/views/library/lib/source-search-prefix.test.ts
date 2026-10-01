import { expect, it } from "vitest";
import { sourceSearchPrefix } from "./source-search-prefix";

it("keeps the same stable path prefix as sorting the complete list", () => {
  const paths = ["a.md", "A.md", "e\u0301.md", "é.md", "한글.md", "z.md", "a.md"];
  let seed = 17;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 500; trial += 1) {
    const sources = Array.from({ length: random(500) }, (_, index) => ({ path: paths[random(paths.length)], index }));
    const limit = random(202);
    const expected = [...sources].sort((a, b) => a.path.localeCompare(b.path)).slice(0, limit);
    expect(sourceSearchPrefix(sources, limit)).toEqual(expected);
  }
});

it("retains the extra entry needed to report a file cap", () => {
  const sources = Array.from({ length: 100_000 }, (_, index) => ({ path: `sources/${100_000 - index}.md` }));
  const expected = [...sources].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 201);
  const selected = sourceSearchPrefix(sources, 201);
  expect(selected).toEqual(expected);
  expect(selected).toHaveLength(201);
});
