import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRowDisclosure } from "./use-row-disclosure";

/**
 * Mount does not measure (`auto`); a transition measures and interpolates. Reversing either fails: a
 * transition left on `auto` kills the animation, and measuring on mount brings back a forced reflow.
 * jsdom has no layout, so `offsetHeight` is stubbed; the test watches which value is written.
 */

const CONTENT_HEIGHT = 120;

function Harness({ open }: { open: boolean }) {
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <div>
      {mounted ? (
        <div ref={boxRef} data-testid="box">
          <div ref={contentRef} data-testid="content">
            body
          </div>
        </div>
      ) : null}
    </div>
  );
}

function box(container: HTMLElement): HTMLElement {
  const element = container.querySelector('[data-testid="box"]');
  if (!element) throw new Error("disclosure box not mounted");
  return element as HTMLElement;
}

describe("useRowDisclosure does not measure on mount", () => {
  const withStubbedHeight = (callback: () => void) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return CONTENT_HEIGHT;
      },
    });
    try {
      callback();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    }
  };

  /**
   * This is the reflow fix itself: with `auto` on mount there is no reason to
   * read `offsetHeight`. A px value means layout was read at that moment.
   */
  it("mounting already open leaves the height at auto without measuring", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");
    });
  });

  it("mounting closed renders nothing", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open={false} />);
      expect(container.querySelector('[data-testid="box"]')).toBeNull();
    });
  });

  // Not measuring on mount means **a transition must measure** — without it
  // there is nothing to interpolate between `auto` and `0`, and the toggle just
  // snaps out of existence (which is why this hook exists).
  it("an open to closed transition starts from the measured px and goes to 0", () => {
    withStubbedHeight(() => {
      const { container, rerender } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");

      act(() => rerender(<Harness open={false} />));

      // Still mounted during the exit transition, with a target height of 0.
      expect(box(container).style.height).toBe("0px");
    });
  });

  it("a closed to open transition interpolates to the measured px", () => {
    withStubbedHeight(() => {
      const { container, rerender } = render(<Harness open={false} />);
      act(() => rerender(<Harness open />));
      expect(box(container).style.height).toBe(`${CONTENT_HEIGHT}px`);
    });
  });
});


describe("disclosure interruption", () => {
  it("reverses from the painted height and cancels the pending unmount", () => {
    vi.useFakeTimers();
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      heights.push(this.style.height);
      return { height: 42 } as DOMRect;
    });
    const heights: string[] = [];
    try {
      const { container, rerender } = render(<Harness open />);
      rerender(<Harness open={false} />);
      expect(heights).toContain("42px");
      heights.length = 0;
      rerender(<Harness open />);
      expect(heights).toContain("42px");
      act(() => vi.advanceTimersByTime(300));
      expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
    } finally {
      rect.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps space for the reduced-motion fade before removing content", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    try {
      const { container, rerender } = render(<Harness open />);
      rerender(<Harness open={false} />);
      expect(box(container).style.height).toBe("auto");
      act(() => vi.advanceTimersByTime(300));
      expect(container.querySelector('[data-testid="content"]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
