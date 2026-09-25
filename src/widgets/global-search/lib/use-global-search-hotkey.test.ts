import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isGlobalSearchHotkey, useGlobalSearchHotkey } from "./use-global-search-hotkey";

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

/**
 * ⌘K and ⇧⌘K are one key for one search (2026-09-26): the shortcut sheet teaches ⌘K alone, and a
 * hand that learned ⇧⌘K lands in the same place. Both used to miss here — `event.key` is `K` with
 * Shift held, and a jamo under a Korean input source.
 */
describe("useGlobalSearchHotkey", () => {
  it("opens on ⌘K", () => {
    const setOpen = vi.fn();
    renderHook(() => useGlobalSearchHotkey(false, setOpen));
    const event = press({ key: "k", code: "KeyK", metaKey: true });
    expect(setOpen).toHaveBeenCalledWith(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens the same search on ⇧⌘K", () => {
    const setOpen = vi.fn();
    renderHook(() => useGlobalSearchHotkey(false, setOpen));
    press({ key: "K", code: "KeyK", metaKey: true, shiftKey: true });
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("opens under a Korean input source, where the key reads as a jamo", () => {
    const setOpen = vi.fn();
    renderHook(() => useGlobalSearchHotkey(false, setOpen));
    press({ key: "ㅏ", code: "KeyK", ctrlKey: true });
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("leaves a plain K, and ⌥⌘K, alone", () => {
    expect(isGlobalSearchHotkey({ key: "k", code: "KeyK", metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isGlobalSearchHotkey({ key: "˚", code: "KeyK", metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
  });

  it("does not open from inside a field, but closes from inside one", () => {
    const setOpen = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const closed = renderHook(() => useGlobalSearchHotkey(false, setOpen));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: true, bubbles: true }));
    expect(setOpen).not.toHaveBeenCalled();
    closed.unmount();

    renderHook(() => useGlobalSearchHotkey(true, setOpen));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: true, bubbles: true }));
    expect(setOpen).toHaveBeenCalledWith(false);
    input.remove();
  });

  it("is inert while disabled", () => {
    const setOpen = vi.fn();
    renderHook(() => useGlobalSearchHotkey(false, setOpen, { disabled: true }));
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(setOpen).not.toHaveBeenCalled();
  });
});
