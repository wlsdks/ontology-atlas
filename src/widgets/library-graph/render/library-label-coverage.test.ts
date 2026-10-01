import { expect, it } from "vitest";
import { LibraryLabelCoverage } from "./library-label-coverage";

it("requires two distinct marks to fully cover a cell before blocking a line", () => {
  const coverage = LibraryLabelCoverage.create(64, 64)!;
  coverage.add("own", -1, -1, 17, 17);
  expect(coverage.blocksLine(8, 8, 1)).toBe(false);
  coverage.add("own", -1, -1, 17, 17);
  expect(coverage.blocksLine(8, 8, 1)).toBe(false);
  coverage.add("other", -1, -1, 17, 17);
  expect(coverage.blocksLine(8, 8, 1)).toBe(true);
  expect(coverage.blocksLine(32, 32, 1)).toBe(false);
});

it("leaves touching edges and partially covered cells for exact collision checks", () => {
  const coverage = LibraryLabelCoverage.create(64, 64)!;
  for (const id of ["a", "b"]) coverage.add(id, 0, 0, 16, 16);
  expect(coverage.blocksLine(0, 0, 1)).toBe(false);
  expect(coverage.blocksLine(16, 16, 1)).toBe(false);
});

it("declines unbounded or invalid viewport allocations", () => {
  for (const [width, height] of [[0, 400], [-1, 400], [Infinity, 400], [NaN, 400], [1e20, 1e20]]) {
    expect(LibraryLabelCoverage.create(width, height)).toBeNull();
  }
});
