import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GUIDE_AUTO_START,
  readGuideAutoStart,
  resolveGuideAutoStart,
  writeGuideAutoStart,
} from "./guide-auto-start";

/**
 * "Show screen guides automatically" — one switch that turns off all six guides.
 *
 * Each guide already appears once per screen, but there are six of them (the map
 * plus five destinations), so moving between screens brings up another one and it
 * **feels like they appear every time**. That is not fixable by editing individual
 * keys, hence a separate axis — and hence this switch's contract: **off stops the
 * automatic appearance only; asking for a guide still opens it.**
 */
describe("guide auto-start switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("기본값은 끔 — 필요한 사람만 켠다 (2026-08-13 소유자 확정)", () => {
    expect(DEFAULT_GUIDE_AUTO_START).toBe(false);
    expect(readGuideAutoStart()).toBe(false);
  });

  it("켜면 저장되고, 끄면 되돌아온다", () => {
    writeGuideAutoStart(true);
    expect(readGuideAutoStart()).toBe(true);
    writeGuideAutoStart(false);
    expect(readGuideAutoStart()).toBe(false);
  });

  /**
   * Only an explicit choice is honoured: the "1" of someone who turned it on before
   * the default flipped to off must survive, while unknown, empty and corrupt
   * values all fall back to the default (off).
   */
  it("켜 둔 저장값(\"1\")은 살아남고, 모르는 값은 끔이다", () => {
    expect(resolveGuideAutoStart("1")).toBe(true);
    expect(resolveGuideAutoStart("0")).toBe(false);
    for (const raw of [null, "", "yes", "true", "nope"]) {
      expect(resolveGuideAutoStart(raw)).toBe(false);
    }
  });
});
