import { describe, expect, it } from "vitest";

import { libraryCoverageCaption, libraryStepStates, libraryWaitingLine } from "./stage-steps";
import type { LibraryUiModel } from "@/features/library";

/**
 * **A folder mid-measurement must not be reported as finished.**
 *
 * The owner read the merged build on a folder of seven sources and seven pages while the
 * hashes were still being taken, and three surfaces gave three answers: the guide's step
 * two said *done · every source already has a write-up that matches its bytes*, its step
 * three said *0 of 7 written up*, and all seven source rows said *checking*. The cause is
 * that hashing is lazy — `needsCompileCount` counts only the sources **known** to be
 * waiting, so "nothing is waiting" and "everything is written up" are not the same claim
 * until every source has been measured.
 *
 * These cases pin the seam. They use only the fields `libraryStepStates` reads, because a
 * fuller model would be a fixture nobody can check against the function's own contract.
 */
type Input = Pick<LibraryUiModel, "sources" | "wikiPages" | "needsCompileCount">;

const source = (state: string) => ({ state }) as unknown as Input["sources"][number];
const page = () => ({ slug: "wiki/a" }) as unknown as Input["wikiPages"][number];

const model = (
  states: readonly string[],
  pages: number,
  needsCompileCount: number,
): Input => ({
  sources: states.map(source),
  wikiPages: Array.from({ length: pages }, page),
  needsCompileCount,
});

describe("where the folder stands, while it is still being measured", () => {
  it("holds Compile and Read at `checking` rather than calling them done", () => {
    const states = libraryStepStates(model(Array(7).fill("checking"), 7, 0));
    expect(states.gather).toBe("done");
    expect(states.compile).toBe("checking");
    expect(states.read).toBe("checking");
    expect(states.checkingCount).toBe(7);
    // Nothing is next: there is nothing to press until the measurement settles.
    expect(states.leadIndex).toBe(-1);
  });

  it("says done once every source is measured and covered", () => {
    const states = libraryStepStates(model(Array(7).fill("compiled"), 7, 0));
    expect(states.compile).toBe("done");
    expect(states.read).toBe("done");
    expect(states.checkingCount).toBe(0);
  });

  it("lets a source that is known to be waiting outrank one still being checked", () => {
    // Two answers are honest at once here; the earlier step is the one to press.
    const states = libraryStepStates(model(["not-compiled", "checking"], 1, 1));
    expect(states.compile).toBe("next");
    expect(states.read).toBe("next");
    expect(states.leadIndex).toBe(1);
    expect(states.checkingCount).toBe(1);
  });

  it("keeps an empty folder's shape: gather next, the rest not yet their turn", () => {
    const states = libraryStepStates(model([], 0, 0));
    expect(states.gather).toBe("next");
    expect(states.compile).toBe("waiting");
    expect(states.read).toBe("waiting");
    expect(states.leadIndex).toBe(0);
  });

  it("calls Compile next in a folder with sources and no page yet", () => {
    const states = libraryStepStates(model(["not-compiled"], 0, 1));
    expect(states.compile).toBe("next");
    expect(states.read).toBe("waiting");
  });

  it("calls Compile next when the only thing waiting is the rest of a long file", () => {
    const states = libraryStepStates(model(["partial"], 1, 1));
    expect(states.compile).toBe("next");
    expect(states.read).toBe("next");
  });
});

/**
 * **The waiting line counts what the rows draw, or the screen prints a zero.**
 *
 * The three unfinished states are three pieces of work, and the line that names them ran
 * off `notCompiledCount` and `staleCount` alone. Adding `partial` to `needsCompileCount`
 * without adding it here would have printed *0 not written up yet* under a folder whose
 * one row said *read in part* — the exact shape of the three-way contradiction the header
 * strip was rewritten to end.
 */
describe("what the waiting line says", () => {
  const t = ((key: string, values?: Record<string, number>) =>
    `${key}(${JSON.stringify(values ?? {})})`) as unknown as Parameters<
    typeof libraryWaitingLine
  >[1];

  const counts = (notCompiled: number, stale: number, partial: number) => ({
    notCompiledCount: notCompiled,
    staleCount: stale,
    partialCount: partial,
  });

  it("says nothing at all when nothing is waiting", () => {
    expect(libraryWaitingLine(counts(0, 0, 0), t)).toBeNull();
  });

  it("names an outdated answer even when each original has a current write-up", () => {
    const sources = [
      { ...source("compiled"), reviewPages: ["wiki/research/release-date"] },
      { ...source("compiled"), reviewPages: ["wiki/research/release-date"] },
    ];
    expect(libraryWaitingLine({ ...counts(0, 0, 0), sources }, t)).toBe(
      'sources.pagesNeedReview({"count":1})',
    );
  });

  it("names a partial read on its own rather than as a missing write-up", () => {
    const line = libraryWaitingLine(counts(0, 0, 2), t);
    expect(line).toBe('sources.partialOnly({"count":2})');
    expect(line).not.toContain("needsCompile");
  });

  it("keeps the partial clause after the work that is actually missing", () => {
    expect(libraryWaitingLine(counts(1, 1, 1), t)).toBe(
      'sources.needsCompileSplit({"notCompiled":1,"stale":1}) · sources.partialOnly({"count":1})',
    );
  });
});


/**
 * ⚠️ **A folder whose sources have all been written up and have since changed read
 * "0 of 6 sources written up"** (measured 2026-09-09).
 *
 * `compiled` means a page exists *and* its bytes still match. Everything else was folded
 * into the plain sentence, so the most ordinary resting state of a live folder — write-ups
 * that have gone stale — reported the same number as a folder nobody had touched. The
 * earlier `checking` and `partial` repairs each added their own clause and left this one.
 */
describe("which coverage sentence step three prints", () => {
  const coverage = (
    states: readonly string[],
    counts: { partial?: number; stale?: number; checking?: number } = {},
  ) =>
    libraryCoverageCaption(
      {
        sources: states.map(source),
        partialCount: counts.partial ?? 0,
        staleCount: counts.stale ?? 0,
      } as Parameters<typeof libraryCoverageCaption>[0],
      counts.checking ?? 0,
    );

  it("names the stale sources instead of reporting a folder with pages as empty", () => {
    const result = coverage(
      ["stale", "stale", "stale", "stale", "stale", "not-compiled"],
      { stale: 5 },
    );
    expect(result.key).toBe("coveredStale");
    expect(result.values).toEqual({ compiled: 0, total: 6, stale: 5 });
  });

  it("keeps the plain sentence when nothing needs a qualifier", () => {
    const result = coverage(["compiled", "compiled", "not-compiled"]);
    expect(result.key).toBe("coveredLine");
    expect(result.values).toEqual({ compiled: 2, total: 3 });
  });

  it("still prefers measuring over part-read over stale, so one clause is named", () => {
    expect(coverage(["checking"], { checking: 1, partial: 1, stale: 1 }).key).toBe(
      "coveredChecking",
    );
    expect(coverage(["partial"], { partial: 1, stale: 1 }).key).toBe("coveredPartial");
    expect(coverage(["stale"], { stale: 1 }).key).toBe("coveredStale");
  });

  it("counts only `compiled` as written up, whatever else the folder holds", () => {
    expect(coverage(["compiled", "stale", "partial"], { partial: 1, stale: 1 }).values.compiled)
      .toBe(1);
  });
});
