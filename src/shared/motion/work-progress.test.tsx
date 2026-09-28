import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkProgress } from "./work-progress";

function parts(container: HTMLElement) {
  return {
    fill: container.querySelector<HTMLElement>("[data-work-fill]")!,
    sweep: container.querySelector<HTMLElement>("[data-work-sweep]")!,
  };
}

describe("WorkProgress", () => {
  it("fills by scaleX with a known total, never by width", () => {
    const { container } = render(<WorkProgress phase="running" done={1} total={4} label="Scan" />);
    const { fill, sweep } = parts(container);
    expect(fill.style.transform).toBe("scaleX(0.25)");
    expect(fill.style.width).toBe("");
    expect(sweep.className).not.toContain("motion-work-sweep");
  });

  it("sweeps only when the total is unknown", () => {
    const { container } = render(<WorkProgress phase="running" done={3} total={null} label="Scan" />);
    const { fill, sweep } = parts(container);
    expect(sweep.className).toContain("motion-work-sweep");
    expect(fill.className).toContain("opacity-0");
    expect(container.firstElementChild).not.toHaveAttribute("aria-valuenow");
  });

  it("ends full in success ink when done", () => {
    const { container } = render(<WorkProgress phase="done" done={2} total={null} label="Scan" />);
    const { fill } = parts(container);
    expect(fill.style.transform).toBe("scaleX(1)");
    expect(fill.className).toContain("status-success");
    expect(container.firstElementChild).toHaveAttribute("aria-valuenow", "100");
  });
});
