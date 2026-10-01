import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SPRING, springEasing, springSettleMs } from "./spring";
import { useSlidingIndicator } from "./use-sliding-indicator";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

const BOXES: Record<string, DOMRect> = {
  strip: rect(100, 50, 400, 40),
  a: rect(100, 50, 60, 40),
  b: rect(172, 50, 80, 40),
};

function Probe({ active, shape }: { active: string; shape: "underline-x" | "surface-y" }) {
  const { containerRef, itemRef, indicatorStyle, placed, animated } = useSlidingIndicator(active, shape);
  return (
    <div ref={containerRef} data-box="strip">
      {placed ? (
        <span data-testid="indicator" data-animated={String(animated)} style={indicatorStyle} />
      ) : null}
      {["a", "b"].map((key) => (
        <button key={key} ref={itemRef(key)} data-box={key}>
          {key}
        </button>
      ))}
    </div>
  );
}

describe("useSlidingIndicator", () => {
  afterEach(() => vi.restoreAllMocks());

  it("places without a transition, then animates later moves", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return BOXES[this.dataset.box ?? ""] ?? rect(0, 0, 0, 0);
    });
    const { rerender } = render(<Probe active="a" shape="underline-x" />);
    const indicator = screen.getByTestId("indicator");
    expect(indicator.dataset.animated).toBe("false");
    expect(indicator.style.transform).toBe("translate(0px, 40px) scaleX(60)");

    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(screen.getByTestId("indicator").dataset.animated).toBe("true");

    rerender(<Probe active="b" shape="underline-x" />);
    expect(screen.getByTestId("indicator").style.transform).toBe("translate(72px, 40px) scaleX(80)");
  });

  it("sizes a surface to the active item", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return BOXES[this.dataset.box ?? ""] ?? rect(0, 0, 0, 0);
    });
    render(<Probe active="b" shape="surface-y" />);
    const style = screen.getByTestId("indicator").style;
    expect([style.width, style.height, style.transform]).toEqual(["80px", "40px", "translate(72px, 0px)"]);
  });

  it("moves on the control spring", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return BOXES[this.dataset.box ?? ""] ?? rect(0, 0, 0, 0);
    });
    render(<Probe active="a" shape="underline-x" />);
    const style = screen.getByTestId("indicator").style;
    expect(style.transitionDuration).toBe(`${springSettleMs(SPRING.control)}ms`);
    expect(style.transitionTimingFunction).toBe(springEasing(SPRING.control));
  });
});
