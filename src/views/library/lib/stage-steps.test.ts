import { describe, expect, it } from "vitest";

import { libraryStepStates } from "./stage-steps";
import type { LibraryUiModel } from "./use-library-model";

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
});
