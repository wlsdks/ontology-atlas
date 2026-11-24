import { describe, expect, it } from "vitest";

import { codeLinePieces } from "./code-line-pieces";

describe("codeLinePieces", () => {
  it("names each bidi override and isolate control so none reaches the screen unseen", () => {
    const line = "if (isAdmin) { /* ‮ } ⁦ begin admins only */";
    const pieces = codeLinePieces(line);
    expect(pieces.filter((piece) => piece.kind === "control")).toEqual([
      { kind: "control", codePoint: "U+202E" },
      { kind: "control", codePoint: "U+2066" },
    ]);
    const text = pieces.map((piece) => (piece.kind === "text" ? piece.text : "")).join("");
    expect(text).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(text).toBe("if (isAdmin) { /*  }  begin admins only */");
  });

  it("keeps a line without controls whole, Hangul and right-to-left letters included", () => {
    expect(codeLinePieces("const 금액 = 'שלום';")).toEqual([{ kind: "text", text: "const 금액 = 'שלום';" }]);
    expect(codeLinePieces("")).toEqual([]);
  });
});
