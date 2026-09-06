import { describe, expect, it } from "vitest";

import { localizeWikiLogSummary } from "./wiki-log-summary";

const ko = (key: string, values?: Record<string, string | number>) =>
  ({
    "wiki.logCount.disagreement": `어긋남 ${values?.count}`,
    "wiki.logCount.superseded": `대체된 주장 ${values?.count}`,
    "wiki.logCount.missingLink": `빠진 연결 ${values?.count}`,
    "wiki.logCount.nameWithoutPage": `문서 없는 이름 ${values?.count}`,
    "wiki.logNoCounts": "실행됨 · 개수 없음",
    "wiki.logNew": "새로 씀",
    "wiki.logRevised": "고침",
    "wiki.logNothingNew": "새 내용 없음",
  })[key] ?? key;

describe("localizeWikiLogSummary", () => {
  it("translates a check's counts while the file keeps the English keys", () => {
    expect(localizeWikiLogSummary("disagreement 0 · superseded 2 · missing-link 1 · name-without-page 5", ko)).toBe(
      "어긋남 0 · 대체된 주장 2 · 빠진 연결 1 · 문서 없는 이름 5",
    );
    expect(localizeWikiLogSummary("ran; counts not stated", ko)).toBe("실행됨 · 개수 없음");
  });

  it("translates a compile's verbs and leaves the slugs alone", () => {
    expect(localizeWikiLogSummary("sources/a.pdf → a (new), b (revised)", ko)).toBe("sources/a.pdf → a (새로 씀), b (고침)");
  });
});
