import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";

import ko from "../../../../messages/ko.json";
import { View3dMenu } from "./View3dMenu";

/**
 * The contract for the view picker the 「3D」 chip opens.
 *
 * What this check holds is not values but **position and count**. When the
 * arrangements lived in the settings sheet under the names 「Ownership/Combination」, the owner
 * failed to find them twice (ledger (84)) — that regression leaves no value in the
 * code, so only the rendered result can catch it.
 */
function mount() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <View3dMenu open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

function mountClosed(onClose: () => void) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <View3dMenu open={false} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("View3dMenu view picker", () => {
  it("names the radiogroup as the map view picker, flat view included", () => {
    mount();
    expect(screen.getByRole("radiogroup")).toHaveAccessibleName("지도 보기");
  });

  it("lists flat, strata and coupling rows in one list", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-strata")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-coupling")).toBeInTheDocument();
  });

  /*
   * The Cone left the picker on 2026-09-25. A reader who had it stored still sees a
   * chosen row — Strata, the containment view that replaced it — rather than a list
   * with nothing checked.
   */
  it("offers no Cone, and a stored Cone reads as Strata chosen", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "ownership");
    mount();
    expect(screen.queryByTestId("topology-view-3d-choice-ownership")).toBeNull();
    expect(screen.queryByText("원뿔")).toBeNull();
    expect(screen.getByTestId("topology-view-3d-choice-strata")).toHaveAttribute("aria-checked", "true");
  });

  /*
   * An abstract noun is only a name to someone who already knows the concept. The
   * words on screen have to be the visible things (cone, cloud) — that was (84)'s
   * second correction.
   */
  it("labels rows by what is visible, never by the abstract arrangement nouns", () => {
    mount();
    expect(screen.getByText("층")).toBeInTheDocument();
    expect(screen.getByText("뉴런")).toBeInTheDocument();
    expect(screen.queryByText("소유")).toBeNull();
    expect(screen.queryByText("결합")).toBeNull();
  });

  it("gives every row a hint line under its title", () => {
    mount();
    for (const id of ["flat", "strata", "coupling"]) {
      const row = screen.getByTestId(`topology-view-3d-choice-${id}`);
      // Title plus hint, two lines. One line means the hint is missing.
      expect(row.querySelectorAll("span").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("checks flat by default, since 3D is opt-in", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toHaveAttribute("aria-checked", "true");
  });

  it("stores 3D on and the coupling arrangement together when coupling is picked", () => {
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-coupling"));
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("on");
    expect(window.localStorage.getItem("atlas.appearance.map-arrangement")).toBe("coupling");
  });

  /**
   * The galaxy is the *other flat view*, so picking it must turn the dome off as well as turn
   * the sky on. The pair is what the drawing reads, and a state where both are on is one the
   * picker must never be able to produce — the map's contrast floors for 3D assume the flat
   * sky is not also being painted (`tests/e2e/map-3d-relation-ink.spec.ts`).
   */
  it("turns the sky on and 3D off when galaxy is picked, so both are never on", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-galaxy"));
    expect(window.localStorage.getItem("atlas.appearance.galaxy")).toBe("on");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });

  it("turns the sky off when a 3D view is picked", () => {
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-coupling"));
    expect(window.localStorage.getItem("atlas.appearance.galaxy")).toBe("off");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("on");
  });

  it("turns both the sky and 3D off when flat is picked", () => {
    window.localStorage.setItem("atlas.appearance.galaxy", "on");
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-flat"));
    expect(window.localStorage.getItem("atlas.appearance.galaxy")).toBe("off");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });

  it("turns 3D off from the same list when flat is picked", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-flat"));
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });

  /**
   * **It does not swallow Esc while closed** (regression, 2026-08-19).
   *
   * This component is **always rendered** beside the chip. Hooks run before any early
   * return, so without guarding the global listener on `open` it intercepts document
   * Esc and calls `stopPropagation()` the whole time it is closed — killing Esc across
   * the app. Measured in CI: node detail stopped closing on Esc, and five specs went
   * red together, covering the keyboard path, focus return and the popover contract.
   *
   * Two things are measured here: «the close function is not called» and «propagation
   * is alive». Drop the latter and an implementation that merely skips `onClose` while
   * still swallowing would pass.
   */
  it("lets document Escape through while closed, so app-wide Escape keeps working", () => {
    let closed = 0;
    mountClosed(() => {
      closed += 1;
    });

    let reachedDocument = 0;
    const spy = () => {
      reachedDocument += 1;
    };
    document.addEventListener("keydown", spy);
    fireEvent.keyDown(document, { key: "Escape" });
    document.removeEventListener("keydown", spy);

    expect(closed, "onClose ran while the picker was closed").toBe(0);
    expect(reachedDocument, "the picker swallowed Escape before it reached the document").toBe(1);
  });
});
