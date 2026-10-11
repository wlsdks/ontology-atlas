import { expect, it } from "vitest";
import { countWhitespaceWords } from "./count-whitespace-words";

it("matches existing whitespace-token counts for every UTF-16 code unit", () => {
  for (let code = 0; code <= 0xffff; code += 1) {
    const text = `a${String.fromCharCode(code)}b`;
    const expected = /\s/.test(String.fromCharCode(code)) ? 2 : 1;
    if (countWhitespaceWords(text) !== expected) throw new Error(`Whitespace mismatch U+${code.toString(16)}`);
  }
});

it("preserves counts for empty input, Unicode strings and long runs", () => {
  const cases = ["", " \n\t", "one", "한글 🐋\n두 번째", "a\u200bb\u0085c", "\ufeffa\u00a0b\u3000c",
    "word ".repeat(10_000), "x".repeat(100_000)];
  let seed = 71;
  for (let trial = 0; trial < 500; trial += 1) {
    let text = "";
    for (let i = 0; i < 100; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      text += ["a", " ", "\t", "\n", "\u2028", "\u2000", "\u180e", "\ud800", "🐋"][seed % 9];
    }
    cases.push(text);
  }
  for (const text of cases) expect(countWhitespaceWords(text)).toBe(text.split(/\s+/).filter(Boolean).length);
});
