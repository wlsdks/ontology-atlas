import { describe, expect, it } from "vitest";
import { resolveCanvasSelectedSlug } from "./resolve-canvas-selection";

const ready = {
  sourceReady: true,
  projectsLoaded: true,
  ontologyLoaded: true,
};

describe("resolveCanvasSelectedSlug", () => {
  it("focuses a resolved node as-is", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        selectedSlug: "capability:checkout",
        resolvedSlug: "capability:checkout",
      }),
    ).toBe("capability:checkout");
  });

  /**
   * The ghost-node fix. The raw slug used to reach the canvas and switch on ego
   * focus; with zero neighbours, every node on the map dimmed.
   */
  it("does not focus a slug missing from this vault, which would dim the whole map", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        selectedSlug: "capability:from-another-vault",
        resolvedSlug: null,
      }),
    ).toBeNull();
  });

  it("holds the original while the vault settles so a deep link does not flicker", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        sourceReady: false,
        selectedSlug: "capability:checkout",
        resolvedSlug: null,
      }),
    ).toBe("capability:checkout");
  });

  it("holds the original while the ontology has not arrived", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        ontologyLoaded: false,
        selectedSlug: "capability:checkout",
        resolvedSlug: null,
      }),
    ).toBe("capability:checkout");
  });

  // A bare slug may be a project slug, so absence cannot be certain until the
  // project list arrives. A kind prefix can never collide with a project, so
  // there is nothing to wait for (same grammar as the miss notice).
  it("a bare slug waits for the project list", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        projectsLoaded: false,
        selectedSlug: "checkout",
        resolvedSlug: null,
      }),
    ).toBe("checkout");
  });

  it("a kind-prefixed slug does not wait for the project list", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        projectsLoaded: false,
        selectedSlug: "element:gone",
        resolvedSlug: null,
      }),
    ).toBeNull();
  });

  it("returns null when the address has nothing", () => {
    expect(
      resolveCanvasSelectedSlug({ ...ready, selectedSlug: null, resolvedSlug: null }),
    ).toBeNull();
  });
});
