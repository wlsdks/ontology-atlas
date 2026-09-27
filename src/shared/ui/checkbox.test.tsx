import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

/** Pins one brand accent, `size-4`, and the value layer's focus-ring grammar. */

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

  it("uses the brand accent, size-4 and the focus ring", () => {
    render(<Checkbox label="x" checked readOnly />);
    const box = screen.getByRole("checkbox");
    expect(box.className).toContain("accent-[color:var(--color-indigo-brand)]");
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
});
