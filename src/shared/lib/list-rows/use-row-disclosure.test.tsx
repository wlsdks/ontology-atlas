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
  const el = container.querySelector('[data-testid="box"]');
  if (!el) throw new Error("disclosure box not mounted");
  return el as HTMLElement;
}

describe("useRowDisclosure — 마운트는 재지 않는다", () => {
  const withStubbedHeight = (fn: () => void) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return CONTENT_HEIGHT;
      },
    });
    try {
      fn();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    }
  };

  /**
   * This is the reflow fix itself: with `auto` on mount there is no reason to
   * read `offsetHeight`. A px value means layout was read at that moment.
   */
  it("이미 열린 채 마운트하면 높이를 재지 않고 auto 로 둔다", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");
    });
  });

  it("닫힌 채 마운트하면 아무것도 그리지 않는다", () => {
    withStubbedHeight(() => {
      const { container } = render(<Harness open={false} />);
      expect(container.querySelector('[data-testid="box"]')).toBeNull();
    });
  });

  // Not measuring on mount means **a transition must measure** — without it
  // there is nothing to interpolate between `auto` and `0`, and the toggle just
  // snaps out of existence (which is why this hook exists).
  it("열림 → 닫힘 전이는 실측 px 에서 출발해 0 으로 간다", () => {
    withStubbedHeight(() => {
      const { container, rerender } = render(<Harness open />);
      expect(box(container).style.height).toBe("auto");

      act(() => rerender(<Harness open={false} />));

      // Still mounted during the exit transition, with a target height of 0.
      expect(box(container).style.height).toBe("0px");
    });
  });

  it("닫힘 → 열림 전이는 실측 px 로 보간한다", () => {
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
