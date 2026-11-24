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

  // A Strata arrangement from an older build must still leave one row checked: 3D.
  it("offers flat, hex, 3d and neural, in that order, and checks the stored one", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "strata");
    mount();
    const rows = screen.getAllByRole("radio");
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(
      ["flat", "hex", "3d", "neural"].map((view) => `topology-view-3d-choice-${view}`),
    );
    expect(rows.filter((row) => row.getAttribute("aria-checked") === "true").map((row) => row.getAttribute("data-testid")))
      .toEqual(["topology-view-3d-choice-3d"]);
  });

  it("names the Neural row with the label its coupling arrangement had", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-neural")).toHaveTextContent("뉴런");
  });

  it("gives every row a hint line under its title", () => {
    mount();
    for (const row of screen.getAllByRole("radio")) {
      // Title plus hint, two lines. One line means the hint is missing.
      expect(row.querySelectorAll("span").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("moves from flat to hex on ArrowDown", () => {
    mount();
    fireEvent.keyDown(screen.getByTestId("topology-view-3d-choice-flat"), { key: "ArrowDown" });
    expect(screen.getByTestId("topology-view-3d-choice-hex")).toHaveAttribute("aria-checked", "true");
  });

  it("checks flat by default, since 3D is opt-in", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toHaveAttribute("aria-checked", "true");
  });

  it("publishes one coherent map choice instead of exposing intermediate flag combinations", () => {
    mount();
    const observed: Array<Array<string | null>> = [];
    const read = () => observed.push(["hex-board", "view3d"].map((key) => window.localStorage.getItem(`atlas.appearance.${key}`)));
    window.addEventListener("ontology-atlas:appearance-preference-change", read);
    try {
      fireEvent.click(screen.getByTestId("topology-view-3d-choice-3d"));
      expect(observed).toEqual([["off", "on"]]);
    } finally {
      window.removeEventListener("ontology-atlas:appearance-preference-change", read);
    }
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
