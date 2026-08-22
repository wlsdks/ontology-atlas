import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRowDisclosure } from "./use-row-disclosure";

/**
 * The **mount versus transition** contract for row disclosure (added from a
 * performance trace, 2026-07-28).
 *
 * **Why it exists.** A single node click cost **62ms of forced reflow, 61ms of
 * it in this hook** (Chrome's ForcedReflow insight named it the top cause). The
 * cause was reading `content.offsetHeight` on the mount path too — a layout read
 * straight after a style write, which is a forced reflow, and with several such
 * rows it becomes layout thrashing.
 *
 * The hook's own comment already held the answer: an already-open row unfolding
 * by itself as it appears is motion the user never asked for. With no animation
 * on mount there is **nothing to measure**.
 *
 * So: mount does not measure (`auto`); a transition measures and interpolates.
 * Either one reversed fails immediately — leaving a transition on `auto` kills
 * the toggle animation, and measuring on mount brings the reflow back.
 *
 * jsdom has no layout, so `offsetHeight` is always 0 and a stub goes on the
 * prototype. What this test watches is **which value is written**, not pixels.
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
