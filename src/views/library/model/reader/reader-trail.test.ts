import { describe, expect, it } from "vitest";

import { activeTrailStops, trailAfterBack, trailAfterOpening, type ReaderTrail } from "./reader-trail";

const stop = (slug: string, top = 0) => ({ slug, title: slug.toUpperCase(), top });

describe("activeTrailStops", () => {
  const trail: ReaderTrail = { at: "wiki/b", stack: [stop("wiki/a", 40)] };

  it("is the stack while the page it leads to is open", () => {
    expect(activeTrailStops(trail, { kind: "wiki", slug: "wiki/b" })).toBe(trail.stack);
  });

  it("is empty for another page, a source, the report or nothing open", () => {
    expect(activeTrailStops(trail, { kind: "wiki", slug: "wiki/c" })).toEqual([]);
    expect(activeTrailStops(trail, { kind: "source", path: "a.md" })).toEqual([]);
    expect(activeTrailStops(trail, { kind: "report" })).toEqual([]);
    expect(activeTrailStops(trail, null)).toEqual([]);
  });
});

describe("trailAfterOpening", () => {
  it("pushes the page being left with its scroll and points the trail at the page opened", () => {
    expect(trailAfterOpening([stop("wiki/a", 10)], { slug: "wiki/b", title: "B" }, 75, "wiki/c")).toEqual({
      at: "wiki/c",
      stack: [stop("wiki/a", 10), { slug: "wiki/b", title: "B", top: 75 }],
    });
  });

  it("leaves the trail alone when no page was open", () => {
    expect(trailAfterOpening([], null, 0, "wiki/c")).toBeNull();
  });
});

describe("trailAfterBack", () => {
  it("returns to the last stop at its scroll and drops it from the trail", () => {
    expect(trailAfterBack([stop("wiki/a", 10), stop("wiki/b", 75)])).toEqual({
      trail: { at: "wiki/b", stack: [stop("wiki/a", 10)] },
      landing: { slug: "wiki/b", top: 75 },
    });
  });

  it("has nowhere to go with an empty trail", () => {
    expect(trailAfterBack([])).toBeNull();
  });
});
