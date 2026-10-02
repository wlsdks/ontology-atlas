import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/locales", async (importActual) => {
  const actual = await importActual<typeof import("@/i18n/locales")>();
  return {
    ...actual,
    LOCALE_META: {
      ...actual.LOCALE_META,
      ja: { htmlLang: "ja", hreflang: "ja", ogLocale: "ja_JP", intlTag: "ja-JP", script: "han-kana" },
      zh: { htmlLang: "zh-Hans", hreflang: "zh-Hans", ogLocale: "zh_CN", intlTag: "zh-CN", script: "han-kana" },
    },
  };
});

import { buildDriftHandoff } from "./brief/drift-handoff";
import { buildInsightsAgentPrompt } from "./insights-agent";

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const rows = [{ name: "Pay", slug: "capabilities/pay", path: "a.ts", at: "2026-01-01", docAt: "2025-01-01", href: "/x" }];

describe("insights handoffs name the answer language", () => {
  it("drift handoff", () => {
    const en = buildDriftHandoff({ rows, locale: "en" })!;
    expect(en).not.toContain("Answer in ");
    expect(buildDriftHandoff({ rows, locale: "ko" })).toMatch(HANGUL);
    for (const [locale, language] of [["ja", "Japanese"], ["zh", "Simplified Chinese"]] as const) {
      const text = buildDriftHandoff({ rows, locale })!;
      expect(text).toContain(`Answer in ${language} —`);
      expect(text).not.toMatch(HANGUL);
      expect(text.startsWith(en)).toBe(true);
    }
  });

  it("insights agent prompt, every tab", () => {
    for (const kind of ["brief", "flow"] as const) {
      const args = { kind, handoff: "h", flowRequest: "f" };
      const en = buildInsightsAgentPrompt({ ...args, locale: "en" });
      expect(en).not.toContain("Answer in ");
      for (const [locale, language] of [["ja", "Japanese"], ["zh", "Simplified Chinese"]] as const) {
        const text = buildInsightsAgentPrompt({ ...args, locale });
        expect(text).toContain(`Answer in ${language} —`);
        expect(text).not.toMatch(HANGUL);
        expect(text.startsWith(en)).toBe(true);
      }
    }
  });
});
