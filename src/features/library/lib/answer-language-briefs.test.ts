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

import { buildAskBrief } from "./ask-brief";
import { buildCompileBrief } from "./compile-brief";
import { buildFixBrief } from "./fix-brief";
import { buildLintBrief } from "./lint-brief";
import { buildProposeNodeBrief } from "./propose-node-brief";
import { buildQuestionDeskBrief, buildQuestionDeskReportBrief, QUESTION_DESK_BRIEF_MAX_CHARS } from "./question-desk-brief";
import { buildWikiShapeFixBrief } from "./wiki-fix-brief";

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const vaultRoot = "/vault";

const builders: Record<string, (locale: string) => string> = {
  compile: (locale) => buildCompileBrief({ sources: [], locale, writerId: "agent:test", vaultRoot }),
  lint: (locale) => buildLintBrief({ pages: [], locale, vaultRoot }),
  ask: (locale) => buildAskBrief({ selection: "x", pageSlug: "wiki/a", question: "explain", locale, vaultRoot }),
  fix: (locale) => buildFixBrief({ finding: { code: "disagreement", pages: ["wiki/a"], summary: "s" }, locale, vaultRoot }),
  propose: (locale) => buildProposeNodeBrief({ candidate: { name: "n", kind: "domain", pages: [], why: "" }, locale, vaultRoot }),
  wikiFix: (locale) => buildWikiShapeFixBrief({ page: "wiki/a", findings: [], locale, vaultRoot }),
  desk: (locale) => buildQuestionDeskBrief({ question: "q", vaultRoot, locale, claims: [], sourceHits: [], coverage: "c" }),
  deskReport: (locale) => buildQuestionDeskReportBrief({ question: "q", vaultRoot, locale, claims: [], sourceHits: [], coverage: "c" }),
};

describe("library briefs name the answer language", () => {
  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: ja and zh read as English plus the sentence, en and ko are unchanged`, () => {
      const en = build("en");
      expect(en).not.toContain("Answer in ");
      expect(build("ko")).toMatch(HANGUL);
      for (const [locale, language] of [["ja", "Japanese"], ["zh", "Simplified Chinese"]] as const) {
        const text = build(locale);
        expect(text).toContain(`Answer in ${language} —`);
        expect(text).not.toMatch(HANGUL);
        expect(text.startsWith(en)).toBe(true);
      }
    });
  }

  it("keeps the question-desk budget with the sentence appended", () => {
    expect(builders.deskReport!("zh").length).toBeLessThanOrEqual(QUESTION_DESK_BRIEF_MAX_CHARS);
  });
});
