import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Sheet } from "./sheet";

afterEach(cleanup);

const linesOf = (sheet: Element) => sheet.querySelectorAll(".rounded-full").length;

describe("Sheet", () => {
  it("is hidden from assistive tech, writes the format in at most four capitals, and draws 2 to 5 lines that a name always repeats", () => {
    const names = ["a.md", "warehouse-automation-proposal.pptx", "q4.csv", "2026-11-03-plan.md", "x.log", "rates.xlsx", "z.txt", "notes.html"];
    const counts = names.map((name) => {
      const { container, unmount } = render(<Sheet variant="source" name={name} format="xlsx2" />);
      const sheet = container.firstElementChild!;
      expect(sheet.getAttribute("aria-hidden")).toBe("true");
      expect(sheet.textContent).toBe("XLSX");
      const count = linesOf(sheet);
      unmount();
      const again = render(<Sheet variant="source" name={name} format="xlsx2" />);
      expect(linesOf(again.container.firstElementChild!)).toBe(count);
      again.unmount();
      return count;
    });
    expect(counts.every((count) => count >= 2 && count <= 5)).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("draws the reading scan only while the source is read", () => {
    const { container, rerender } = render(<Sheet variant="source" name="a.pdf" format="pdf" />);
    expect(container.querySelector(".motion-sheet-scan")).toBeNull();
    rerender(<Sheet variant="source" name="a.pdf" format="pdf" reading />);
    expect(container.querySelector(".motion-sheet-scan")).not.toBeNull();
  });

  it("puts a page's source format on a tab, and no tab when the page cites nothing", () => {
    expect(render(<Sheet variant="page" name="Rates" format="csv" />).container.textContent).toBe("CSV");
    expect(render(<Sheet variant="page" name="Rates" format={null} />).container.textContent).toBe("");
  });

  it("stacks one sheet per order of magnitude, capped at five", () => {
    const sheets = (count: number) => {
      const { container, unmount } = render(<Sheet variant="stack" count={count} share={0} done={false} />);
      const value = Number(container.firstElementChild!.getAttribute("data-sheets"));
      unmount();
      return value;
    };
    expect([0, 1, 9, 10, 100, 1_000, 1_000_000].map(sheets)).toEqual([1, 1, 2, 2, 4, 5, 5]);
  });

  it("draws no edge fill at zero and never a stray tick for a small share", () => {
    const scale = (share: number) => {
      const { getByTestId, unmount } = render(<Sheet variant="stack" count={500} share={share} done={false} />);
      const value = Number(/scaleY\(([\d.]+)\)/.exec(getByTestId("sheet-stack-fill").style.transform)![1]);
      unmount();
      return value;
    };
    expect(scale(0)).toBe(0);
    expect(scale(0.002)).toBeGreaterThan(0.2);
    expect(scale(0.5)).toBe(0.5);
    expect(scale(1)).toBe(1);
  });
});
