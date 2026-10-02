import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CosmosMirror } from "./CosmosMirror";
import { computeCosmosLayout } from "./layout/cosmos-layout";

function nineDomains() {
  const nodes: { id: string; label: string; kind: string; size: number }[] = [{ id: "p", label: "Shop", kind: "project", size: 1 }];
  const edges: { source: string; target: string; kind: "contains"; relationType: string }[] = [];
  const contains = (source: string, target: string) => edges.push({ source, target, kind: "contains", relationType: "contains" });
  for (let d = 0; d < 9; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain", size: 1 });
    contains("p", `d${d}`);
    for (let c = 0; c < 2; c += 1) {
      const cap = `d${d}c${c}`;
      nodes.push({ id: cap, label: `Capability ${d}.${c}`, kind: "capability", size: 1 });
      contains(`d${d}`, cap);
      nodes.push({ id: `${cap}e`, label: `Element ${d}.${c}`, kind: "element", size: 1 });
      contains(cap, `${cap}e`);
    }
  }
  return computeCosmosLayout(nodes as never, edges as never, {});
}

const layout = nineDomains();
const labels = { list: "Domains", galaxyRow: (name: string, count: number) => `${name}, ${count}` };
const base = { layout, labels, marks: [], restSignal: 0, deadEndSignal: 0, walkNotice: "Nothing that way", selectedId: null, onSelect: () => {} };

describe("CosmosMirror", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lists the project, then nine domains with their capabilities and no elements", () => {
    const { getByTestId } = render(<CosmosMirror {...base} />);
    const list = getByTestId("cosmos-galaxy-list");
    const top = [...list.children].map((li) => li.querySelector(":scope > button")!.getAttribute("data-cosmos-id"));
    expect(top).toEqual(["p", ...layout.galaxies.map((g) => g.id)]);
    expect(top).toHaveLength(10);
    for (const g of layout.galaxies) {
      const row = list.querySelector(`[data-cosmos-id="${g.id}"]`)!.parentElement!;
      const nested = [...row.querySelectorAll(":scope > ul [data-cosmos-id]")].map((b) => b.getAttribute("data-cosmos-id"));
      expect(nested).toEqual(g.clusters.map((c) => c.id));
    }
    expect(list.querySelector('[data-cosmos-id$="e"]')).toBeNull();
    expect(list.querySelectorAll("button[tabindex='-1']")).toHaveLength(1 + 9 + 18);
  });

  it("presses the selected row and selects on click", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(<CosmosMirror {...base} selectedId="d3" onSelect={onSelect} />);
    const list = getByTestId("cosmos-galaxy-list");
    expect(list.querySelector('[data-cosmos-id="d3"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(list.querySelector('[data-cosmos-id="d4"]')!.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(list.querySelector('[data-cosmos-id="d4c1"]')!);
    expect(onSelect).toHaveBeenCalledWith("d4c1");
  });

  it("writes data-mark once, 120 ms after the last rest", () => {
    const marks = [{ id: "d0", x: 10.4, y: 20.6, r: 30 }];
    const { getByTestId, rerender } = render(<CosmosMirror {...base} marks={marks} restSignal={1} />);
    const list = getByTestId("cosmos-galaxy-list");
    rerender(<CosmosMirror {...base} marks={marks} restSignal={2} />);
    expect(list.dataset.cosmosReady).toBe("false");
    act(() => vi.advanceTimersByTime(100));
    rerender(<CosmosMirror {...base} marks={[{ id: "d0", x: 40, y: 50, r: 30 }]} restSignal={3} />);
    act(() => vi.advanceTimersByTime(100));
    expect(list.querySelector('[data-cosmos-id="d0"]')!.getAttribute("data-mark")).toBeNull();
    act(() => vi.advanceTimersByTime(20));
    expect(list.querySelector('[data-cosmos-id="d0"]')!.getAttribute("data-mark")).toBe("40,50,30");
    expect(list.dataset.cosmosReady).toBe("true");
  });

  it("announces a dead end once per cooldown", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { getByTestId, rerender } = render(<CosmosMirror {...base} />);
    const notice = getByTestId("cosmos-walk-notice");
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(notice.textContent).toBe("");
    rerender(<CosmosMirror {...base} deadEndSignal={1} />);
    expect(notice.textContent).toBe("Nothing that way");
    const first = notice.firstElementChild;
    now.mockReturnValue(1_500);
    rerender(<CosmosMirror {...base} deadEndSignal={2} />);
    expect(notice.firstElementChild).toBe(first);
    now.mockReturnValue(2_300);
    rerender(<CosmosMirror {...base} deadEndSignal={3} />);
    expect(notice.firstElementChild).not.toBe(first);
    now.mockRestore();
  });
});
