import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

/**
 * Checkbox — 계약 (2026-08-15 「체계」석 비준).
 *
 * 창립 census: 6곳/5파일이 손으로 반복하며 세 갈래로 갈라져 있었다 — accent
 * 토큰 2종(brand 4 · accent 1) + **UA 기본색 1**(둘 이상의 채색 시스템 금지의
 * 현행범), 그리고 **6곳 전부 focus-visible 0**. 이 계약이 그 셋을 못박는다:
 * accent 는 brand 하나 · 크기는 size-4 · 초점 링은 값 층 문법.
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
    expect(box.className).toContain("var(--color-indigo-a46)");
  });

  it("checked/disabled 네이티브 prop 이 그대로 흐른다", () => {
    render(<Checkbox label="x" checked disabled readOnly />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });
});
