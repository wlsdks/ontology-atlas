import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **영어 화면에는 한글이 안 나온다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 도그푸딩)
 *
 * 두 카탈로그의 키 수는 정확히 같았다(2,770 대 2,770). 그래서 "번역 누락 0"
 * 으로 보였는데, **값이 반쯤만 번역돼 있었다**:
 *
 * | 키 | 있던 값 | 문제 |
 * |---|---|---|
 * | `en …create.secondaryName` | `한국어 이름 (선택)` | 영어 사용자가 라벨을 못 읽는다 |
 * | `en …secondaryNamePlaceholder` | `한국어 이름 (optional)` | 한 문구에 두 언어 |
 * | `ko …secondaryNamePlaceholder` | `English name (선택)` | 반대 방향으로 같은 실수 |
 *
 * 셋 다 **"상대 언어 이름 칸"** 이라는 같은 자리다. 쓴 사람이 *가리키는 언어*
 * 와 *쓰는 언어* 를 헷갈린 것이다 — 영어 화면에서 한국어 이름을 물을 때 라벨은
 * **영어로** "Korean name" 이어야 한다.
 *
 * 키 대조로는 절대 안 잡힌다. 키는 양쪽에 다 있었다.
 *
 * ## 왜 한쪽 방향만 재나
 *
 * 한국어 화면에는 영문이 정당하게 많다 — 브랜드명(`Ontology Atlas`), CLI 명령,
 * 파일 경로, 기술 용어. 그래서 "ko 에 라틴 문자 금지" 는 신호보다 소음이
 * 크다. 반대 방향은 깨끗하다: **영어 화면의 한글은 거의 항상 번역 누락**이고,
 * 정당한 예외는 언어 이름 하나뿐이다.
 */

const HANGUL = /[가-힣㄰-㆏]/;

/**
 * 정당한 예외 — **언어 이름은 자기 언어로 쓴다**(브라우저 언어 선택 UI 의
 * 보편 관례). 영어 화면의 언어 목록에 "Korean" 이 아니라 "한국어" 가 있어야
 * 그 언어를 쓰는 사람이 자기 언어를 찾는다.
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
 * **두 카탈로그의 키가 어긋나지 않는다.** 위 검사는 값을 보고, 이건 구조를
 * 본다 — 키가 한쪽에만 있으면 그 화면에는 문장 대신 **키 경로**가 그려진다.
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
