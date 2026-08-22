import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **No Hangul on English screens.**
 *
 * ## Why this gate exists (dogfooding, 2026-07-29)
 *
 * The two catalogues had exactly the same key count (2,770 vs 2,770), so it looked
 * like "0 missing translations" — but **the values were only half translated**:
 *
 * | Key | Value present | Problem |
 * |---|---|---|
 * | `en …create.secondaryName` | `한국어 이름 (선택)` | an English user cannot read the label |
 * | `en …secondaryNamePlaceholder` | `한국어 이름 (optional)` | two languages in one string |
 * | `ko …secondaryNamePlaceholder` | `English name (선택)` | the same mistake in the other direction |
 *
 * All three are the same slot: **the "other language's name" field**. The author
 * confused *the language being named* with *the language being written in* — asking
 * for a Korean name on an English screen, the label must read "Korean name" **in
 * English**.
 *
 * Key comparison can never catch this. The keys were present on both sides.
 *
 * ## Why only one direction is measured
 *
 * Korean screens legitimately contain plenty of English — the brand name (`Ontology
 * Atlas`), CLI commands, file paths, technical terms. So "no Latin characters in ko"
 * would produce more noise than signal. The other direction is clean: **Hangul on an
 * English screen is almost always a missing translation**, with exactly one
 * legitimate exception.
 */

const HANGUL = /[가-힣㄰-㆏]/;

/**
 * The legitimate exception — **a language's name is written in that language** (the
 * universal convention in browser language pickers). The language list on an English
 * screen must show "한국어" rather than "Korean" so a speaker of that language can
 * find their own.
 */
const ALLOWED = new Set(["locale.korean"]);

function flatten(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe("영어 카탈로그 — 번역이 반쯤 되다 만 자리를 잡는다", () => {
  const entries: Array<[string, string]> = [];
  flatten(JSON.parse(readFileSync("messages/en.json", "utf8")), "", entries);

  it("probe: 카탈로그를 실제로 읽고 있다", () => {
    expect(entries.length).toBeGreaterThan(2000);
  });

  it("probe: 예외 목록이 실재하는 키를 가리킨다", () => {
    const keys = new Set(entries.map(([k]) => k));
    for (const allowed of ALLOWED) {
      expect(keys.has(allowed), `예외 목록의 "${allowed}" 가 카탈로그에 없다 — 지워라`).toBe(true);
    }
  });

  it("한글이 남아 있지 않다", () => {
    const offenders = entries
      .filter(([key]) => !ALLOWED.has(key))
      .filter(([, value]) => HANGUL.test(value))
      .map(([key, value]) => `${key} = ${value.slice(0, 60)}`);

    expect(
      offenders,
      `영어 화면에 한글이 그려진다 — 거의 항상 번역이 반쯤 되다 만 자리다.\n` +
        `키 대조로는 안 잡힌다(키는 양쪽에 다 있다).\n` +
        `언어 이름처럼 자기 언어로 써야 하는 것이면 ALLOWED 에 이유와 함께 등재하라.`,
    ).toEqual([]);
  });
});

/**
 * **The two catalogues' keys must not diverge.** The check above looks at values;
 * this one looks at structure — a key present on only one side renders **the key
 * path** on that screen instead of a sentence.
 */
describe("두 카탈로그 — 키 집합이 같다", () => {
  const load = (locale: string) => {
    const out: Array<[string, string]> = [];
    flatten(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")), "", out);
    return new Set(out.map(([k]) => k));
  };
  const ko = load("ko");
  const en = load("en");

  it("ko 에만 있는 키가 없다", () => {
    expect([...ko].filter((k) => !en.has(k))).toEqual([]);
  });
  it("en 에만 있는 키가 없다", () => {
    expect([...en].filter((k) => !ko.has(k))).toEqual([]);
  });
});
