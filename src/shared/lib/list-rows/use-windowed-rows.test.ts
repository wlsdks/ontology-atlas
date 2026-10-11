import { describe, expect, it } from "vitest";

import { windowRows } from "./use-windowed-rows";

describe("windowRows", () => {
  const heights = Array.from({ length: 1000 }, () => 36);

  it("renders nothing for an empty list", () => {
    expect(windowRows([], 4, 0, 600, 8)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
  });

  it("at the top, renders one viewport of rows plus the overscan below, and pads the rest", () => {
    const w = windowRows(heights, 4, 0, 600, 8);
    expect(w.start).toBe(0);
    // 600 / 40 = 15 rows in view, then 8 more.
    expect(w.end).toBe(23);
    expect(w.before).toBe(0);
    // Every row after `end`, each with the gap above it.
    expect(w.after).toBe((1000 - 23) * 40);
  });

  it("scrolled into the middle, the pads add up to the rows not rendered and the window brackets the viewport", () => {
    const w = windowRows(heights, 4, 10_000, 600, 8);
    // Row 250 starts at 10,000: eight rows of overscan stand above it.
    expect(w.start).toBe(242);
    expect(w.end).toBe(250 + 15 + 8);
    expect(w.before).toBe(242 * 40);
    expect(w.after).toBe((1000 - w.end) * 40);
  });

  it("at the end, the last row is rendered and nothing is padded after it", () => {
    const w = windowRows(heights, 4, 1000 * 40, 600, 8);
    expect(w.end).toBe(1000);
    expect(w.after).toBe(0);
  });

  it("rows of different heights keep the pads exact", () => {
    const mixed = [20, 60, 40, 80, 20, 60, 40, 80];
    const w = windowRows(mixed, 0, 100, 50, 0);
    // 20 + 60 = 80 < 100 ≤ 80 + 40: row 2 is the first in view.
    expect(w.start).toBe(2);
    expect(w.before).toBe(80);
    expect(w.end).toBe(4);
    expect(w.after).toBe(20 + 60 + 40 + 80);
  });

  it("pads and rendered rows add up to the height of the whole list", () => {
    const varied = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? 72 : 36));
    const gap = 4;
    const whole = varied.reduce((sum, h) => sum + h, 0) + (varied.length - 1) * gap;
    for (const top of [0, 2_000, 9_000, whole - 600]) {
      const w = windowRows(varied, gap, top, 600, 8);
      const rendered = varied.slice(w.start, w.end).reduce((sum, h) => sum + h, 0) + (w.end - w.start - 1) * gap;
      expect(w.before + rendered + w.after, `scrolled to ${top}`).toBe(whole);
    }
  });

  it("a list that fits its viewport renders every row", () => {
    const w = windowRows([36, 36, 36], 4, 0, 600, 8);
    expect(w).toEqual({ start: 0, end: 3, before: 0, after: 0 });
  });
});

it('bounds the first committed row set before measuring a large scrollable list', async () => {
  const { createElement } = await import('react');
  const { render, cleanup } = await import('@testing-library/react');
  const { vi } = await import('vitest');
  const { useWindowedRows } = await import('./use-windowed-rows');
  let firstMeasuredCount: number | null = null;
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'LI' && firstMeasuredCount === null) firstMeasuredCount = this.parentElement!.children.length;
    return { x: 0, y: 0, top: 0, left: 0, bottom: 36, right: 100, width: 100, height: 36, toJSON: () => ({}) };
  });
  function List() {
    const [range, ref] = useWindowedRows({ count: 10_000, estimate: 36 });
    return createElement('div', { style: { overflowY: 'auto' } }, createElement('ul', { ref },
      Array.from({ length: range.end - range.start }, (_, i) => createElement('li', { key: range.start + i }, `Row ${range.start + i}`))));
  }
  try {
    const result = render(createElement(List));
    expect(firstMeasuredCount).not.toBeNull();
    expect(firstMeasuredCount).toBeLessThan(200);
    expect(result.container.querySelectorAll('li').length).toBeLessThan(200);
  } finally {
    cleanup();
    height.mockRestore();
    rect.mockRestore();
  }
});

it("keeps a zero-height scroller bounded and recomputes when it becomes visible", async () => {
  const { createElement } = await import("react");
  const { render, cleanup, act } = await import("@testing-library/react");
  const { vi } = await import("vitest");
  const { useWindowedRows } = await import("./use-windowed-rows");
  let viewportHeight = 0;
  let resize: (() => void) | undefined;
  const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(() => viewportHeight);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  function List({ count }: { count: number }) {
    const [range, ref] = useWindowedRows({ count, estimate: 36 });
    return createElement("div", { style: { overflowY: "auto" } },
      createElement("ul", { ref, "data-window": `${range.start}-${range.end}` },
        Array.from({ length: range.end - range.start }, (_, i) =>
          createElement("li", { key: range.start + i }, `Row ${range.start + i}`))));
  }
  try {
    const result = render(createElement(List, { count: 1000 }));
    expect(result.container.querySelectorAll("li")).toHaveLength(64);
    result.rerender(createElement(List, { count: 100_000 }));
    expect(result.container.querySelectorAll("li")).toHaveLength(64);
    expect(resize).toBeDefined();
    act(() => { viewportHeight = 360; resize!(); });
    expect(result.container.querySelector("ul")?.getAttribute("data-window")).toBe("0-18");
    expect(result.container.querySelectorAll("li")).toHaveLength(18);
    act(() => { viewportHeight = 0; resize!(); });
    expect(result.container.querySelectorAll("li")).toHaveLength(64);
    result.rerender(createElement(List, { count: 3 }));
    expect(result.container.querySelectorAll("li")).toHaveLength(3);
  } finally {
    cleanup();
    height.mockRestore();
    vi.unstubAllGlobals();
  }
});
