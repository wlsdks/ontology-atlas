import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";

import ko from "../../../../messages/ko.json";
import { View3dMenu } from "./View3dMenu";

/**
 * The view picker's position, count and wording: a picker nobody finds leaves no wrong
 * value in the code (ledger (84)), so only the rendered result can catch it.
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
  it("names the radiogroup as the map view picker", () => {
    mount();
    expect(screen.getByRole("radiogroup")).toHaveAccessibleName("지도 보기");
  });

  it("lists flat, strata and coupling rows in one list", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-strata")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-coupling")).toBeInTheDocument();
  });

  // A stored Cone still shows a chosen row (Strata), not a list with nothing checked.
  it("offers no Cone, and a stored Cone reads as Strata chosen", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "ownership");
    mount();
    expect(screen.queryByTestId("topology-view-3d-choice-ownership")).toBeNull();
    expect(screen.queryByText("원뿔")).toBeNull();
    expect(screen.getByTestId("topology-view-3d-choice-strata")).toHaveAttribute("aria-checked", "true");
  });

  // An abstract noun is only a name to someone who already knows the concept ((84)).
  it("labels rows by what is visible, never by the abstract arrangement nouns", () => {
    mount();
    expect(screen.getByText("층")).toBeInTheDocument();
    expect(screen.getByText("뉴런")).toBeInTheDocument();
    expect(screen.queryByText("소유")).toBeNull();
    expect(screen.queryByText("결합")).toBeNull();
  });

  it("gives the flat, strata and coupling rows a hint line under their titles", () => {
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

  it("publishes one coherent map choice instead of exposing intermediate flag combinations", () => {
    mount();
    const observed: Array<Array<string | null>> = [];
    const read = () => observed.push([
      "territories", "hex-board", "galaxy", "map-arrangement", "view3d",
    ].map((key) => window.localStorage.getItem(`atlas.appearance.${key}`)));
    window.addEventListener("ontology-atlas:appearance-preference-change", read);
    try {
      fireEvent.click(screen.getByTestId("topology-view-3d-choice-coupling"));
      expect(observed).toEqual([["off", "off", "off", "coupling", "on"]]);
    } finally {
      window.removeEventListener("ontology-atlas:appearance-preference-change", read);
    }
  });

  /**
   * The map's 3D contrast floors assume the flat sky is not also painted
   * (`tests/e2e/map-3d-relation-ink.spec.ts`), so the picker never leaves both on.
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
   * The picker is always rendered, so an unguarded listener would swallow Escape app-wide.
   * Both counts matter: without the propagation count, skipping `onClose` while still
   * swallowing would pass.
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
