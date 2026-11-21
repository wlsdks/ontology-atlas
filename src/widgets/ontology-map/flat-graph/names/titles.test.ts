import { describe, expect, it } from "vitest";

import { blockAbove, tabularPieces, titleMayRise } from "./titles";
import type { NameInput, PlacedName } from "./placed-name";

describe("tabularPieces", () => {
  const measure = (text: string) => (text === "1" ? 3 : text.length * 6);

  it("centres each digit in a cell as wide as the widest digit and keeps other runs whole", () => {
    expect(tabularPieces("ab 12", "font", measure)).toEqual({
      pieces: [{ text: "ab ", dx: 0 }, { text: "1", dx: 19.5 }, { text: "2", dx: 24 }],
      width: 30,
    });
  });
});

describe("blockAbove", () => {
  const name = (dy: number, minY: number, maxY: number): PlacedName => ({
    id: "domain:a", role: "domain", text: "A", font: "", dx: 0, dy, align: "center", box: { minX: -5, maxX: 5, minY, maxY },
  });

  it("mirrors a title block about its disc, keeping its lines in order", () => {
    const above = blockAbove([name(20, 10, 30), name(40, 32, 48)]);
    expect(above.map((n) => n.dy)).toEqual([-38, -18]);
    expect(above.map((n) => [n.box.minY, n.box.maxY])).toEqual([[-48, -28], [-26, -10]]);
  });
});

describe("titleMayRise", () => {
  const input = (focusId: string | null, named: string[]) =>
    ({ focusId, named: new Set(named), model: { domainById: new Map([["domain:focus", {}], ["domain:far", {}]]) } }) as unknown as Pick<NameInput, "model" | "focusId" | "named">;

  it("lets a named domain at the far end of a focused domain's lines take the side above", () => {
    expect(titleMayRise(input("domain:focus", ["domain:far"]), "domain:far")).toBe(true);
  });

  it("keeps the focused domain, an unnamed one and any view without a domain focus below", () => {
    expect(titleMayRise(input("domain:focus", ["domain:focus"]), "domain:focus")).toBe(false);
    expect(titleMayRise(input("domain:focus", []), "domain:far")).toBe(false);
    expect(titleMayRise(input(null, ["domain:far"]), "domain:far")).toBe(false);
    expect(titleMayRise(input("capability:x", ["domain:far"]), "domain:far")).toBe(false);
  });
});
