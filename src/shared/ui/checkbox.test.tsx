import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

/**
 * Checkbox contract, ratified by the 「체계」 (design systems) seat on 2026-08-15.
 *
 * Founding inventory: 6 hand-repeated call sites across 5 files had split three ways
 * — two accent tokens (brand ×4, accent ×1) plus **one UA default colour**, a live
 * violation of the ban on more than one colour system — and **all 6 had zero
 * focus-visible**. This contract pins those three: one brand accent, size-4, and the
 * value layer's focus-ring grammar.
 */

describe("Checkbox", () => {
  it("라벨이 곧 타깃이다 — 라벨 클릭이 토글이고, fieldLabel(row) 문법을 입는다", () => {
    const onChange = vi.fn();
    render(<Checkbox label="허브로 표시" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText("허브로 표시"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const label = screen.getByText("허브로 표시").closest("label") as HTMLElement;
    expect(label.className).toContain("cursor-pointer");
    expect(label.className).toContain("min-h-6");
  });

  it("캐노니컬 토큰 — brand accent · size-4 · 초점 링", () => {
    render(<Checkbox label="x" checked readOnly />);
    const box = screen.getByRole("checkbox");
    expect(box.className).toContain("accent-[color:var(--color-indigo-brand)]");
    expect(box.className).toContain("size-4");
    expect(box.className).toContain("focus-visible:ring-2");
    expect(box.className).toContain("var(--color-indigo-focus-ring)");
  });

  it("checked/disabled 네이티브 prop 이 그대로 흐른다", () => {
    render(<Checkbox label="x" checked disabled readOnly />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });
});
