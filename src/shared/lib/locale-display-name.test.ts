import { describe, expect, it } from "vitest";
import { readDisplayLocales, resolveLocaleDisplayName } from "./locale-display-name";

describe("readDisplayLocales", () => {
  it("collects only `display_<2-letter locale>` string values", () => {
    expect(
      readDisplayLocales({
        title: "My project",
        display_ko: "내 프로젝트",
        display_en: "My project",
        display: "ignored — not locale-scoped",
        display_kor: "ignored — 3 letters",
        display_ja: 42,
      }),
    ).toEqual({ ko: "내 프로젝트", en: "My project" });
  });

  it("returns undefined when there is nothing to collect", () => {
    expect(readDisplayLocales({ title: "x" })).toBeUndefined();
    expect(readDisplayLocales(null)).toBeUndefined();
    expect(readDisplayLocales({ display_ko: "   " })).toBeUndefined();
  });
});

describe("resolveLocaleDisplayName", () => {
  const fm = { title: "My project", display_ko: "내 프로젝트" };

  it("uses the name for the screen language", () => {
    expect(resolveLocaleDisplayName(fm, "ko", "My project")).toBe("내 프로젝트");
  });

  it("falls back to the canonical title rather than inventing a name", () => {
    expect(resolveLocaleDisplayName(fm, "en", "My project")).toBe("My project");
    expect(resolveLocaleDisplayName(undefined, "ko", "My project")).toBe("My project");
    expect(resolveLocaleDisplayName(fm, undefined, "My project")).toBe("My project");
  });
});
