import { describe, expect, it } from "vitest";

import { KEY_ZOOM_STEP, keyboardZoomIntent } from "./keyboard-zoom";

const plain = { metaKey: false, ctrlKey: false, altKey: false };

describe("keyboard zoom — the three keys every reference shares", () => {
  it("+ and = zoom in one step, - and _ zoom out the same step", () => {
    expect(keyboardZoomIntent({ ...plain, key: "+" })).toEqual({ kind: "zoom", factor: KEY_ZOOM_STEP });
    expect(keyboardZoomIntent({ ...plain, key: "=" })).toEqual({ kind: "zoom", factor: KEY_ZOOM_STEP });
    expect(keyboardZoomIntent({ ...plain, key: "-" })).toEqual({ kind: "zoom", factor: 1 / KEY_ZOOM_STEP });
    expect(keyboardZoomIntent({ ...plain, key: "_" })).toEqual({ kind: "zoom", factor: 1 / KEY_ZOOM_STEP });
  });

  it("0 fits the whole map", () => {
    expect(keyboardZoomIntent({ ...plain, key: "0" })).toEqual({ kind: "fit" });
  });

  it("modifier combinations stay with the browser — page zoom must keep working", () => {
    expect(keyboardZoomIntent({ ...plain, key: "+", metaKey: true })).toBeNull();
    expect(keyboardZoomIntent({ ...plain, key: "-", ctrlKey: true })).toBeNull();
    expect(keyboardZoomIntent({ ...plain, key: "0", altKey: true })).toBeNull();
  });

  it("any other key is not ours", () => {
    expect(keyboardZoomIntent({ ...plain, key: "ArrowUp" })).toBeNull();
    expect(keyboardZoomIntent({ ...plain, key: "a" })).toBeNull();
  });

  it("a step is a deliberate approach, not a jump", () => {
    expect(KEY_ZOOM_STEP).toBeGreaterThan(1.1);
    expect(KEY_ZOOM_STEP).toBeLessThanOrEqual(1.5);
  });
});
