import { describe, expect, it } from "vitest";
import {
  focusTrapTarget,
  isPlainLeftClick,
  isPressOutsideDrawer,
  shouldDismissOnDrag,
} from "./drawer-interaction";

describe("shouldDismissOnDrag", () => {
  it("closes on a long pull or a fast flick, not on a short slow one", () => {
    expect(shouldDismissOnDrag(121, 0)).toBe(true);
    expect(shouldDismissOnDrag(10, 501)).toBe(true);
    expect(shouldDismissOnDrag(120, 500)).toBe(false);
    expect(shouldDismissOnDrag(-300, -900)).toBe(false);
  });
});

describe("isPressOutsideDrawer", () => {
  it("ignores presses inside the drawer and inside another interactive overlay", () => {
    document.body.innerHTML = `
      <aside id="drawer"><button id="inside"></button></aside>
      <div data-interactive-overlay="true"><span id="overlay-child"></span></div>
      <main id="outside"></main>`;
    const drawer = document.getElementById("drawer");
    expect(isPressOutsideDrawer(document.getElementById("inside"), drawer)).toBe(false);
    expect(isPressOutsideDrawer(document.getElementById("overlay-child"), drawer)).toBe(false);
    expect(isPressOutsideDrawer(document.getElementById("outside"), drawer)).toBe(true);
    expect(isPressOutsideDrawer(null, drawer)).toBe(false);
  });
});

describe("focusTrapTarget", () => {
  const first = document.createElement("button");
  const middle = document.createElement("button");
  const last = document.createElement("button");
  const disabledLast = document.createElement("button");
  disabledLast.setAttribute("disabled", "");

  it("wraps Tab from the last item to the first and Shift+Tab from the first to the last", () => {
    expect(focusTrapTarget([first, middle, last], last, false)).toBe(first);
    expect(focusTrapTarget([first, middle, last], first, true)).toBe(last);
  });

  it("leaves focus alone between the ends", () => {
    expect(focusTrapTarget([first, middle, last], middle, false)).toBeNull();
    expect(focusTrapTarget([first, middle, last], middle, true)).toBeNull();
    expect(focusTrapTarget([], null, false)).toBeNull();
  });

  it("does not count a disabled item as the last stop", () => {
    expect(focusTrapTarget([first, middle, disabledLast], middle, false)).toBe(first);
  });
});

describe("isPlainLeftClick", () => {
  const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };

  it("accepts only an unmodified primary click", () => {
    expect(isPlainLeftClick(plain)).toBe(true);
    expect(isPlainLeftClick({ ...plain, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, altKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...plain, button: 1 })).toBe(false);
  });
});
