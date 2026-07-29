import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **`<…>` 는 메시지 안에서 글자가 아니다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29, 같은 실수 두 번째)
 *
 * next-intl 은 ICU 메시지 안의 `<name>` 을 **rich-text 태그**로 파싱한다.
 * 닫는 짝이 없으면 그 메시지는 렌더에 실패하고, 화면에는 문장 대신
 * **키 경로**(`atlasGit.cliPlaceholderHint`)가 그려진다. 예외가 콘솔에만
 * 남으므로 타입 검사·lint·단위 테스트를 전부 통과한다.
 *
 * 이 세션에서 두 번 밟았다:
 *
 * 1. CLI 자리 표시를 `<atlas>` 로 썼다가 `/projects` 의 CLI 행이 통째로
 *    사라졌다 → `$ATLAS` 로 바꿨다.
 * 2. 그 `$ATLAS` 를 **설명하는 문장**에 `export ATLAS=<경로>` 라고 썼다가
 *    `/git` 의 안내가 키 경로로 렌더됐다 → 따옴표로 바꿨다.
 *
 * 두 번째가 특히 고약하다 — 첫 번째의 교훈을 적어 둔 주석 바로 옆에서 났다.
 * **사람의 기억은 게이트가 아니다.**
 *
 * ## 무엇을 재나
 *
 * 메시지 문자열 안의 `<` 중 **정상적인 rich-text 태그가 아닌 것**. 이 저장소가
 * 실제로 쓰는 태그(`<b>…</b>` 류)는 짝이 맞으므로 통과한다. 부등호를 글자로
 * 쓰고 싶으면 따옴표·괄호·「」 를 쓴다.
 */

const LOCALES = ["ko", "en"] as const;

/** `<name>`, `</name>`, `<name/>` — 정상 태그 문법. */
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*\s*\/?>/g;

function collect(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) collect(value, `${path}.${key}`, out);
  }
}

describe("i18n 메시지 — `<` 를 글자로 쓰지 않는다", () => {
  it.each(LOCALES)("%s", (locale) => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const entries: Array<[string, string]> = [];
    collect(messages, locale, entries);

    // 탐지기가 0건을 돌며 통과하는 것을 막는 프로브.
    expect(entries.length).toBeGreaterThan(500);

    const offenders = entries.filter(([, value]) => value.replace(TAG, "").includes("<"));

    expect(
      offenders.map(([path, value]) => `${path}: ${value.slice(0, 80)}`),
      `next-intl 은 메시지 안의 \`<name>\` 을 rich-text 태그로 읽는다. 짝이 없으면\n` +
        `그 문장은 렌더에 실패하고 화면에 **키 경로**가 그려진다 — 콘솔에만 남아서\n` +
        `타입·lint·단위 테스트를 전부 통과한다.\n` +
        `부등호를 글자로 쓰려면 따옴표("…")·괄호·「」 를 쓴다.`,
    ).toEqual([]);
  });

  /**
   * **탐지기가 실제로 잡는지** — 이 검사가 없으면 위 정규식이 언젠가 조용히
   * 모든 것을 통과시켜도 아무도 모른다.
   */
  it("probe: 짝 없는 태그를 실제로 잡는다", () => {
    const bad = 'export ATLAS=<path to checkout>';
    const good = 'export ATLAS="path to checkout"';
    const richText = "우리는 <b>이렇게</b> 강조한다";
    expect(bad.replace(TAG, "").includes("<")).toBe(true);
    expect(good.replace(TAG, "").includes("<")).toBe(false);
    expect(richText.replace(TAG, "").includes("<")).toBe(false);
  });
});
