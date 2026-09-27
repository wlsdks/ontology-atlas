import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import ko from "../../../../messages/ko.json";
import {
  computeVisibleSteps,
  DESTINATION_TOURS,
  type DestinationTourId,
} from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";
import { DESTINATION_HREF, DESTINATION_IDS } from "@/shared/config/destinations";
import { resolveActiveNavDestination } from "@/shared/lib/nav-destination";

const DESTINATIONS = Object.keys(DESTINATION_TOURS) as DestinationTourId[];

/**
 * Derived from `DESTINATION_IDS` minus the map, plus compatible section routes in
 * `DESTINATION_HREF`, so adding a destination fails here until its guidance is written.
 */
describe("destination tours", () => {
  it("gives every rail destination except the map its own tour", () => {
    // The map's eight-step journey belongs to `TOUR_STEPS`.
    const primary = new Set<string>(DESTINATION_IDS);
    const compatibleSections = Object.entries(DESTINATION_HREF)
      .filter(([id, href]) => !primary.has(id) && resolveActiveNavDestination(href) !== null)
      .map(([id]) => id);
    const expected = [...DESTINATION_IDS.filter((id) => id !== "map"), ...compatibleSections].sort();
    expect(DESTINATIONS.slice().sort()).toEqual(expected);
  });

  it("reads a non-empty destination list", () => {
    // An empty source of truth would pass the test above as empty equals empty.
    expect(DESTINATION_IDS.length).toBeGreaterThan(5);
    expect(DESTINATION_IDS).toContain("map");
  });

  it("has one purpose card and one element card per tour", () => {
    for (const id of DESTINATIONS) {
      const steps = DESTINATION_TOURS[id];
      expect(steps).toHaveLength(2);
    // The first page is a centred card with no anchor.
      expect(steps[0].anchor).toBeNull();
    // The second page points at a real element (canvas anchors are map-only).
      expect(steps[1].anchor).toEqual({ type: "testid", value: expect.any(String) });
      expect(steps.every((s) => s.persona === "all")).toBe(true);
    }
  });

  it("has copy in both ko and en", () => {
    for (const id of DESTINATIONS) {
      for (const step of DESTINATION_TOURS[id]) {
        for (const [locale, messages] of [
          ["ko", ko],
          ["en", en],
        ] as const) {
          const copy = (messages.guidedTour.steps as Record<string, unknown>)[step.copyKey] as
            | { title?: string; body?: string }
            | undefined;
          expect(copy?.title, `${locale}.${step.copyKey}.title`).toBeTruthy();
          expect(copy?.body, `${locale}.${step.copyKey}.body`).toBeTruthy();
        }
      }
    }
  });

  it("keeps a separate seen key per destination", () => {
    const keys = DESTINATIONS.map((id) => destinationTourStatusKey(id));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("guided-tour:v1");
  });

  it("collapses to one card when the second anchor is absent", () => {
    const visible = computeVisibleSteps(DESTINATION_TOURS.docs, {
      persona: "all",
      hasSelection: false,
      canResolveAnchor: (anchor) => anchor === null,
    });
    expect(visible.map((s) => s.id)).toEqual(["docs-what"]);
  });
});
