import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConceptEgoGraph } from "./ConceptEgoGraph";
import type { ConceptEgo } from "../model/build-concept-ego";

/** The count the reading table shows and the count the drawing renders must agree. */
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

describe("ConceptEgoGraph drawn neighbour count", () => {
  for (const count of [2, 3, 4, 5]) {
    it(`draws all ${count} neighbours of a single relation kind without overlap`, () => {
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

  it("draws no name at rest and exactly the pointed-at neighbour's name with a halo", () => {
    const { rerender } = render(
      <ConceptEgoGraph ego={ego(4)} bearingLabel={() => "담고 있는 것"} moreLabel={(n) => `외 ${n}`} />,
    );
    const svg = screen.getAllByRole("img")[0];
    expect(svg.querySelectorAll("text")).toHaveLength(0);

    rerender(
      <ConceptEgoGraph ego={ego(4)} bearingLabel={() => "담고 있는 것"} moreLabel={(n) => `외 ${n}`} activeId="n2" />,
    );
    const labels = screen.getAllByTestId("atlas-git-ego-label");
    expect(labels.map((el) => el.textContent)).toEqual(["이웃 2"]);
    expect(labels[0].style.paintOrder).toBe("stroke");
  });

  // One neighbour can stand on two bearings, so its two marks need distinct React keys.
  it("draws a neighbour that stands on two bearings once per bearing, each under its own key", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const twice: ConceptEgo = {
      ...ego(0),
      total: 2,
      neighbors: {
        belongsTo: [{ id: "shared", label: "공유 이웃", kind: "capability" }],
        contains: [],
        dependsOn: [],
        usedBy: [{ id: "shared", label: "공유 이웃", kind: "capability" }],
      },
    };
    const { rerender } = render(
      <ConceptEgoGraph ego={twice} bearingLabel={() => "관계"} moreLabel={(n) => `외 ${n}`} />,
    );
    rerender(
      <ConceptEgoGraph ego={twice} bearingLabel={() => "관계"} moreLabel={(n) => `외 ${n}`} activeId="shared" />,
    );
    expect(screen.getAllByTestId("atlas-git-ego-mark")).toHaveLength(2);
    const keyWarnings = errors.mock.calls.filter(([message]) => String(message).includes("same key"));
    errors.mockRestore();
    expect(keyWarnings).toHaveLength(0);
  });
});
