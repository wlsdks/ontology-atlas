import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXIT_WINDOW_MS } from "@/shared/lib/use-presence";
import { WorkStatus, type WorkPhase } from "./work-status";

function glyph(container: HTMLElement) {
  return container.querySelector("[data-work-glyph]");
}

describe("WorkStatus", () => {
  it("keeps one glyph element from waiting through running to done", () => {
    const { container, rerender } = render(<WorkStatus phase="waiting" label="Read" />);
    const first = glyph(container);
    for (const phase of ["running", "done"] as WorkPhase[]) {
      rerender(<WorkStatus phase={phase} label="Read" />);
      expect(glyph(container)).toBe(first);
      expect(container.firstElementChild).toHaveAttribute("data-work-phase", phase);
    }
  });

  it("carries no role and no live region of its own", () => {
    const { container } = render(
      <WorkStatus phase="running" label="Read" detail="3" progress={{ done: 1, total: 3 }} />,
    );
    expect(container.querySelector("[role]")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("shows a static check when it mounts already done", () => {
    const { container } = render(<WorkStatus phase="done" label="Read" />);
    expect(container.querySelector("[data-drawn]")).toHaveAttribute("data-drawn", "static");
    expect(container.querySelector(".motion-check-draw")).toBeNull();
  });

  it("draws the check only on a transition into done", () => {
    const { container, rerender } = render(<WorkStatus phase="running" label="Read" />);
    rerender(<WorkStatus phase="done" label="Read" />);
    expect(container.querySelector("[data-drawn]")).toHaveAttribute("data-drawn", "draw");
    expect(container.querySelector(".motion-check-draw")).not.toBeNull();
  });

  it("spins only without a real total and fills the arc with one", () => {
    const { container, rerender } = render(<WorkStatus phase="running" label="Read" />);
    expect(container.querySelector(".motion-work-spin")).not.toBeNull();
    rerender(<WorkStatus phase="running" label="Read" progress={{ done: 1, total: 4 }} />);
    expect(container.querySelector(".motion-work-spin")).toBeNull();
    expect(container.querySelector(".motion-work-arc")).toHaveAttribute("stroke-dashoffset", "0.75");
  });

  it("crossfades the label and drops the old one after the exit window", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<WorkStatus phase="running" label="Read" />);
      rerender(<WorkStatus phase="failed" label="Stopped" />);
      expect(container.querySelector(".motion-swap-in")).toHaveTextContent("Stopped");
      expect(container.querySelector(".motion-swap-out")).toHaveTextContent("Read");
      act(() => {
        vi.advanceTimersByTime(EXIT_WINDOW_MS);
      });
      expect(container.querySelector(".motion-swap-out")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
