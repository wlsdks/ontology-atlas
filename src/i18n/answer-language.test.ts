import { describe, expect, it } from "vitest";

import { answerLanguageName, answerLanguageSentence, withAnswerLanguage } from "@/i18n/answer-language";
import { LOCALE_META, type LocaleMeta } from "@/i18n/locales";

const FOUR: Record<string, LocaleMeta> = {
  ...LOCALE_META,
  ja: { htmlLang: "ja", hreflang: "ja", ogLocale: "ja_JP", intlTag: "ja-JP", script: "han-kana" },
  zh: { htmlLang: "zh-Hans", hreflang: "zh-Hans", ogLocale: "zh_CN", intlTag: "zh-CN", script: "han-kana" },
};

describe("answer language", () => {
  it("names each locale from its html language", () => {
    expect(answerLanguageName("en", FOUR)).toBe("English");
    expect(answerLanguageName("ko", FOUR)).toBe("Korean");
    expect(answerLanguageName("ja", FOUR)).toBe("Japanese");
    expect(answerLanguageName("zh", FOUR)).toBe("Simplified Chinese");
  });

  it("leaves en and ko text untouched and appends the sentence for every other locale", () => {
    expect(withAnswerLanguage("brief", "en", FOUR)).toBe("brief");
    expect(withAnswerLanguage("brief", "ko", FOUR)).toBe("brief");
    expect(withAnswerLanguage("brief", "zh", FOUR)).toBe(`brief\n\n${answerLanguageSentence("zh", FOUR)}`);
    expect(answerLanguageSentence("zh", FOUR)).toMatch(/^Answer in Simplified Chinese/);
    expect(answerLanguageSentence("ja", FOUR)).toMatch(/^Answer in Japanese/);
  });
});
