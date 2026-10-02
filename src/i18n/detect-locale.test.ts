import { describe, expect, it } from "vitest";
import { detectLocale } from "./detect-locale";

const FOUR = ["en", "ko", "ja", "zh"];

describe("detectLocale", () => {
  it.each([
    [["ja-JP", "en"], null, "ja"],
    [["zh-CN"], null, "zh"],
    [["zh-Hans-CN"], null, "zh"],
    [["zh"], null, "zh"],
    [["zh-SG"], null, "zh"],
    [["zh-TW", "en-US"], null, "en"],
    [["zh-HK"], null, "en"],
    [["zh-Hant"], null, "en"],
    [["fr"], null, "en"],
    [["fr", "ko-KR"], null, "ko"],
    [["ko"], "ja", "ja"],
    [["ko"], "xx", "ko"],
    [[], null, "en"],
  ])("%j with stored %j gives %s across four locales", (languages, stored, expected) => {
    expect(detectLocale(languages, stored, FOUR)).toBe(expected);
  });

  it("answers as before while only en and ko are routable", () => {
    expect(detectLocale(["ja-JP", "ko"], null)).toBe("ko");
    expect(detectLocale(["zh-CN"], null)).toBe("en");
    expect(detectLocale(["ko-KR"], null)).toBe("ko");
    expect(detectLocale(["en-GB"], "ko")).toBe("ko");
    expect(detectLocale(["ko"], "ja")).toBe("ko");
  });
});
