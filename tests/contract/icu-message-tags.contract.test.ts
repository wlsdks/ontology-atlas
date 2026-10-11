import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * next-intl parses `<name>` in a message as a rich-text tag; without a closing partner the message
 * fails to render and shows the key path. Only well-formed balanced tags may appear.
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
      `next-intl reads \`<name>\` inside a message as a rich-text tag. Without its pair\n` +
        `the sentence fails to render and the screen shows the **key path**; the error stays in the console,\n` +
        `so types, lint and unit tests all pass.\n` +
        `To show an angle bracket as text, use quotation marks ("…"), parentheses or 「」.`,
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
