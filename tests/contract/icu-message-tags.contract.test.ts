import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **`<…>` is not a character inside a message.**
 *
 * ## Why this gate exists (2026-07-29, the second time the same mistake happened)
 *
 * next-intl parses `<name>` inside an ICU message as a **rich-text tag**. Without a
 * closing partner the message fails to render and the screen shows the **key path**
 * (`atlasGit.cliPlaceholderHint`) instead of a sentence. The exception only reaches
 * the console, so it passes type checking, lint, and unit tests.
 *
 * It happened twice in one session:
 *
 * 1. The CLI placeholder was written as `<atlas>` and the entire CLI row on
 *    `/projects` disappeared → changed to `$ATLAS`.
 * 2. The sentence **explaining** that `$ATLAS` was written as
 *    `export ATLAS=<path>` and `/git`'s guidance rendered as a key path → changed
 *    to quotes.
 *
 * The second is the nasty one — it happened right next to the comment recording the
 * first one's lesson. **Human memory is not a gate.**
 *
 * ## What is measured
 *
 * Every `<` inside a message string that is **not a well-formed rich-text tag**.
 * The tags this repository actually uses (`<b>…</b>` and friends) are balanced and
 * pass. To write an angle bracket as a character, use quotes, parentheses, or 「」.
 */

const LOCALES = ["ko", "en"] as const;

/** `<name>`, `</name>`, `<name/>` — well-formed tag syntax. */
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

    // Probe that stops the detector passing while it runs over 0 items.
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
   * **Whether the detector actually catches.** Without this check, the regex above
   * could one day silently pass everything and nobody would know.
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
