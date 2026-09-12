import { describe, expect, it } from "vitest";

import { elideHashMiddle, HASH_ELISION_KEPT_PER_END } from "./elide-hash";

const SHA = "60dba891e88d9c54fd05506ba05889f6a66c87cc68135dfeb0db92eaa9c423dc";

describe("elideHashMiddle — one line, and both ends of it", () => {
  it("keeps the same number of characters at each end", () => {
    const elided = elideHashMiddle(SHA);
    const [head, tail] = elided.split("…");
    expect(head).toBe(SHA.slice(0, HASH_ELISION_KEPT_PER_END));
    expect(tail).toBe(SHA.slice(-HASH_ELISION_KEPT_PER_END));
    expect(head.length).toBe(tail.length);
  });

  it("is short enough for the 1040 column and still comparable at both ends", () => {
    // The value cell measures 456px at 1040x720 and the row's mono line holds ~69
    // characters; the clause after the hash costs 20 of them.
    expect(elideHashMiddle(SHA).length).toBeLessThanOrEqual(49);
    // A prefix this long is what makes the comparison worth doing at all.
    expect(HASH_ELISION_KEPT_PER_END).toBeGreaterThanOrEqual(12);
  });

  it("leaves anything it cannot shorten exactly as it was", () => {
    expect(elideHashMiddle("")).toBe("");
    expect(elideHashMiddle("abc")).toBe("abc");
    // A sentence standing in for a hash that was never measured must not be cut.
    expect(elideHashMiddle("deadbeef", 16)).toBe("deadbeef");
    // The boundary: `keptPerEnd * 2 + 1` is what the elided form costs, so eliding a value
    // of exactly that length gains nothing and the value comes back whole.
    expect(elideHashMiddle("a".repeat(9), 4)).toBe("a".repeat(9));
    expect(elideHashMiddle("a".repeat(10), 4)).toBe("aaaa…aaaa");
  });

  it("returns the value untouched rather than throwing when asked to keep nothing", () => {
    expect(elideHashMiddle(SHA, 0)).toBe(SHA);
    expect(elideHashMiddle(SHA, -1)).toBe(SHA);
  });
});
