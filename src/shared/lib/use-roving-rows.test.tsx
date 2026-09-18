import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import { useRovingRows } from "./use-roving-rows";
import { rowTop } from "./use-windowed-rows";

function List({ count }: { count: number }) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const roving = useRovingRows({ count, listRef, pageSize: 3 });
  return (
    <ul ref={listRef} onKeyDown={roving.onKeyDown} data-testid="list">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <button type="button" data-testid={`row-${i}`} data-row-index={i} tabIndex={roving.tabIndexOf(i)} onFocus={() => roving.onRowFocus(i)}>
            row {i}
          </button>
        </li>
      ))}
    </ul>
  );
}

describe("useRovingRows", () => {
  it("one row is the tab stop; the arrows, PageDown/Up, Home and End move it and focus follows", () => {
    render(<List count={10} />);
    const stops = () => screen.getAllByRole("button").filter((b) => b.tabIndex === 0).map((b) => b.dataset.testid);
    expect(stops()).toEqual(["row-0"]);
    act(() => screen.getByTestId("row-0").focus());
    fireEvent.keyDown(screen.getByTestId("row-0"), { key: "ArrowDown" });
    expect(stops()).toEqual(["row-1"]);
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-1");
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-4");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-9");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-9");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-0");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("row-0");
    expect(stops()).toEqual(["row-0"]);
  });

  it("a row that takes focus by pointer becomes the stop", () => {
    render(<List count={5} />);
    act(() => screen.getByTestId("row-3").focus());
    expect(screen.getByTestId("row-3").tabIndex).toBe(0);
    expect(screen.getByTestId("row-0").tabIndex).toBe(-1);
  });

  it("when the stop has scrolled out of the rendered rows, the nearest rendered row carries the tab stop", () => {
    function Windowed({ start, end }: { start: number; end: number }) {
      const listRef = useRef<HTMLUListElement | null>(null);
      const roving = useRovingRows({ count: 100, listRef, rendered: { start, end } });
      const rows = [...new Set([start, end - 1, 0])];
      return <div>{rows.map((i) => <button key={i} type="button" data-testid={`row-${i}`} data-row-index={i} tabIndex={roving.tabIndexOf(i)} />)}</div>;
    }
    const { rerender } = render(<Windowed start={0} end={10} />);
    expect(screen.getByTestId("row-0").tabIndex).toBe(0);
    rerender(<Windowed start={60} end={80} />);
    expect(screen.getByTestId("row-60").tabIndex).toBe(0);
    expect(screen.getByTestId("row-79").tabIndex).toBe(-1);
  });

  it("keys from something inside the list that is not a row are left alone", () => {
    render(<List count={3} />);
    const list = screen.getByTestId("list");
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    list.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("rowTop", () => {
  it("is the sum of the rows before, each with its gap", () => {
    expect(rowTop([10, 20, 30], 4, 0)).toBe(0);
    expect(rowTop([10, 20, 30], 4, 2)).toBe(10 + 4 + 20 + 4);
    expect(rowTop([10, 20, 30], 4, 9)).toBe(10 + 4 + 20 + 4 + 30 + 4);
  });
});
