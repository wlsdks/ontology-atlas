import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * i18n 제목 메시지의 브랜드 일관성 가드.
 *
 * 앱 표시명은 `metadata.siteName` 단일 출처이고, metadata 제목 템플릿은
 * `%s · {siteName}` 이다. client-side `useDocumentTitle` 이 소비하는 정적
 * `documentTitle*` 메시지도 같은 브랜드 접미사를 써야 한다. 구분자(' · ')를
 * 포함한 제목 값이 siteName 으로 끝나지 않으면 brand drift 회귀다 (#293 —
 * siteName 을 "Ontology Atlas" 로 리네임할 때 3개 메시지가 "ontology-atlas"
 * 접미사로 남아 같은 페이지의 og:title 과 <title> 이 어긋났던 사건).
 */

const LOCALES = ["en", "ko"] as const;
const TITLE_SEPARATOR = " · ";

type MessageTree = { [key: string]: string | MessageTree };

function loadMessages(locale: string): MessageTree {
  const file = path.join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as MessageTree;
}

function flatten(
  tree: MessageTree,
  prefix = "",
  acc: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      flatten(value, keyPath, acc);
    } else if (typeof value === "string") {
      acc[keyPath] = value;
    }
  }
  return acc;
}

describe("i18n document-title brand consistency", () => {
  for (const locale of LOCALES) {
    const flat = flatten(loadMessages(locale));
    const siteName = flat["metadata.siteName"];

    const titleSuffixEntries = Object.entries(flat).filter(
      ([key, value]) =>
        /documentTitle/i.test(key) && value.includes(TITLE_SEPARATOR),
    );

    it(`[${locale}] defines metadata.siteName`, () => {
      expect(siteName).toBeTruthy();
    });

    it(`[${locale}] has separator-bearing document-title messages to guard`, () => {
      // 가드 대상이 사라지면 테스트가 무의미해지므로 최소 1개는 존재해야 한다.
      expect(titleSuffixEntries.length).toBeGreaterThan(0);
    });

    it.each(titleSuffixEntries)(
      `[${locale}] "%s" ends with siteName`,
      (key, value) => {
        expect(
          value.endsWith(`${TITLE_SEPARATOR}${siteName}`),
          `${key} = ${JSON.stringify(value)} should end with "${TITLE_SEPARATOR}${siteName}"`,
        ).toBe(true);
      },
    );
  }
});
