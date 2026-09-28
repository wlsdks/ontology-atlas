import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompactCopyButton } from "@/shared/ui/compact-copy-button";
import { FeedbackGlyph } from "./feedback-glyph";

const icon = <svg data-testid="idle-icon" />;

describe("FeedbackGlyph", () => {
  it("shows the icon and no check while idle", () => {
    const { container } = render(<FeedbackGlyph state="idle" icon={icon} size={14} />);
    expect(screen.getByTestId("idle-icon").parentElement?.className).toContain("opacity-100");
    expect(container.querySelector(".motion-check-draw")).toBeNull();
  });

  it.each(["copied", "done"] as const)("draws the check in success ink for %s", (state) => {
    const { container } = render(<FeedbackGlyph state={state} icon={icon} size={14} />);
    const check = container.querySelector(".motion-check-draw");
    expect(check).not.toBeNull();
    expect(check?.closest("[class*='status-success']")).not.toBeNull();
    expect(container.querySelector("[class*='status-danger']")?.className).toContain("opacity-0");
  });

  it("shows the X in danger ink only for failed", () => {
    const { container } = render(<FeedbackGlyph state="failed" icon={icon} size={14} />);
    expect(container.querySelector("[class*='status-danger']")?.className).toContain("opacity-100");
    expect(container.querySelector(".motion-check-draw")).toBeNull();
  });
});

describe("CompactCopyButton feedback", () => {
  const base = { label: "Copy", ariaLabel: "Copy example", onClick: () => {} };

  it("marks travel only when icon-only", () => {
    const { rerender } = render(<CompactCopyButton {...base} copied={false} state="failed" iconOnly />);
    expect(screen.getByRole("button").hasAttribute("data-feedback-travel")).toBe(true);
    rerender(<CompactCopyButton {...base} copied={false} state="failed" />);
    expect(screen.getByRole("button").hasAttribute("data-feedback-travel")).toBe(false);
    expect(screen.getByRole("button").getAttribute("data-feedback")).toBe("failed");
  });

  it("announces the changed label, and nothing while idle", () => {
    const { rerender } = render(<CompactCopyButton {...base} copied={false} />);
    expect(screen.getByRole("status").textContent).toBe("");
    rerender(<CompactCopyButton {...base} copied label="Copied" />);
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  it("announces the changed accessible name when the label stays", () => {
    const { rerender } = render(<CompactCopyButton {...base} copied={false} />);
    rerender(<CompactCopyButton {...base} copied ariaLabel="Example copied" />);
    expect(screen.getByRole("status").textContent).toBe("Example copied");
  });
});
