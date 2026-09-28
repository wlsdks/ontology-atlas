import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("toggles on a label click and wears the fieldLabel(row) grammar", () => {
    const onChange = vi.fn();
    render(<Checkbox label="허브로 표시" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText("허브로 표시"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const label = screen.getByText("허브로 표시").closest("label") as HTMLElement;
    expect(label.className).toContain("cursor-pointer");
    expect(label.className).toContain("min-h-6");
  });

  it("draws its own token box at size-4 with the focus ring", () => {
    render(<Checkbox label="x" checked readOnly />);
    const box = screen.getByRole("checkbox");
    expect(box.className).toContain("appearance-none");
    expect(box.className).toContain("peer");
    expect(box.className).toContain("border-[color:var(--color-text-quaternary)]");
    expect(box.className).toContain("checked:bg-[color:var(--color-indigo-brand)]");
    expect(box.className).toContain("size-4");
    expect(box.className).toContain("focus-visible:ring-2");
    expect(box.className).toContain("var(--color-indigo-focus-ring)");
  });

  it("passes the native checked and disabled props through", () => {
    render(<Checkbox label="x" checked disabled readOnly />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });

  it("keeps one static check beside the box for the peer rule to draw", () => {
    const { container } = render(<Checkbox label="x" checked readOnly />);
    const mark = container.querySelector(".motion-checkbox-mark");
    expect(mark).toHaveAttribute("data-drawn", "static");
    expect(mark).toHaveAttribute("aria-hidden");
    expect(mark?.previousElementSibling).toBe(screen.getByRole("checkbox"));
  });
});
