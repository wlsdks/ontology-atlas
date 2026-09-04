import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import { GestureHint } from "./GestureHint";

/**
 * The gesture hint (elements/gesture-hint) is a one-time, auto-dismissing touch
 * overlay. Its two stated boundaries are the whole element: it gates entirely on
 * `(pointer: coarse)`, so a mouse user must never see it, and a dismissal is written
 * to local storage so it does not come back on the next visit.
 */

const STORAGE_KEY = "demo:gesture-hint:dismissed:v1";

function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderHint() {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <GestureHint />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.removeItem(STORAGE_KEY);
});

describe("GestureHint", () => {
  it("never appears on a fine pointer, however long the page stays open", () => {
    setPointer(false);
    renderHint();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the touch hint once and remembers the dismissal so it does not return", () => {
    setPointer(true);
    const first = renderHint();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const hint = screen.getByRole("status");
    expect(hint).toHaveTextContent(enMessages.searchWidgets.gestureHint.body);

    act(() => {
      screen.getByRole("button", { name: enMessages.searchWidgets.gestureHint.closeAriaLabel }).click();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    first.unmount();

    renderHint();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
