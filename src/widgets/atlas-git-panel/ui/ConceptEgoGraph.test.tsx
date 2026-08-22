import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConceptEgoGraph } from "./ConceptEgoGraph";
import type { ConceptEgo } from "../model/build-concept-ego";

/**
 * **The count the reading table shows and the count the drawing renders must
 * agree.**
 *
 * Measured 2026-08-02: the label said "contains 3" and only two circles were
 * visible. With a single relation kind the fan spans the whole circle, and
 * placing slots at `i/(slots-1)` puts the first and last at **exactly the same
 * angle**, so one hides under the other.
 *
 * An overlap is worse than a gap — the user cannot tell what they lost.
 */
function ego(count: number): ConceptEgo {
  return {
    id: "self",
    label: "쇼핑",
    kind: "domain",
    domainLabel: null,
    docSlug: "domains/shop",
    summary: null,
    agentSlug: "domains/shop",
    projectLabels: [],
    total: count,
    neighbors: {
      belongsTo: [],
      contains: Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        label: `이웃 ${i}`,
        kind: "capability",
      })),
      dependsOn: [],
      usedBy: [],
    },
  };
}

describe("ConceptEgoGraph — 그린 이웃 수", () => {
  for (const count of [2, 3, 4, 5]) {
    it(`관계가 한 종류뿐이어도 ${count}개를 다 그린다 (겹침 0)`, () => {
      render(
        <ConceptEgoGraph
          ego={ego(count)}
          bearingLabel={() => "담고 있는 것"}
          moreLabel={(n) => `외 ${n}`}
        />,
      );
      const marks = screen.getAllByRole("img")[0].querySelectorAll("title");
      expect(marks.length).toBe(count);

      // Coordinates are checked too: two nodes at one position keep the count
      // correct while one of them is invisible.
      const centers = [...screen.getAllByRole("img")[0].querySelectorAll("circle")]
        .map((c) => `${c.getAttribute("cx")},${c.getAttribute("cy")}`)
        .filter((v) => !v.includes("null"));
      expect(new Set(centers).size).toBe(centers.length);
    });
  }
});
