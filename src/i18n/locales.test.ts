import { describe, expect, it } from "vitest";

import {
  htmlLangOf,
  isAppLocale,
  LOCALE_META,
  LOCALE_NAME_KEY,
  type LocaleMeta,
} from "@/i18n/locales";

const FOUR: Record<string, LocaleMeta> = {
  ...LOCALE_META,
  ja: {
    htmlLang: "ja",
    hreflang: "ja",
    ogLocale: "ja_JP",
    intlTag: "ja-JP",
    script: "han-kana",
  },
  zh: {
    htmlLang: "zh-Hans",
    hreflang: "zh-Hans",
    ogLocale: "zh_CN",
    intlTag: "zh-CN",
    script: "han-kana",
  },
};

describe("locale registry", () => {
  it("accepts only routed locales by default", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("ko")).toBe(true);
    expect(isAppLocale("ja")).toBe(false);
    expect(isAppLocale("zh")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
    expect(isAppLocale("EN")).toBe(false);
  });

  it("accepts every locale of an injected list", () => {
    const list = Object.keys(FOUR);
    expect(list.map((code) => isAppLocale(code, list))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(isAppLocale("fr", list)).toBe(false);
  });

  it("maps a locale to its html lang, with zh as Simplified", () => {
    expect(htmlLangOf("ko")).toBe("ko");
    expect(htmlLangOf("ja", FOUR)).toBe("ja");
    expect(htmlLangOf("zh", FOUR)).toBe("zh-Hans");
    expect(htmlLangOf("xx", FOUR)).toBe("xx");
  });

  it("names each locale by a message key", () => {
    expect(LOCALE_NAME_KEY).toEqual({ en: "english", ko: "korean" });
  });
});
