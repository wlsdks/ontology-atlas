import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { column } from "../../../scripts/lib/i18n/locale-vocabulary.mjs";

/**
 * Keeps code-style phrasing out of on-screen text (`messages/*.json`); the canonical source is
 * `docs/GLOSSARY.md`. Also checks that commands the screens invoke exist. Values users type and words
 * that must be found are exempt, and only what is inside parentheses is allowed.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

type Flat = Record<string, string>;

function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  if (typeof value === "string") {
    out[prefix] = value;
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

const LOCALES = ["ko", "en"] as const;
const MESSAGES: Record<string, Flat> = Object.fromEntries(
  LOCALES.map((l) => [l, flatten(JSON.parse(read(`messages/${l}.json`)))]),
);

/**
 * Words not used on screen — sourced from the table in `docs/GLOSSARY.md`.
 *
 * `frontmatter` is valid **only inside parentheses** (parentheses rule). The rest is not used at all.
 */
const BANNED: ReadonlyArray<{
  word: RegExp;
  use: string;
  parenthesizedOk?: boolean;
}> = column("codeStyleWords", "ko").words;

/** Leave only the appearance wrapped in parentheses like `…(frontmatter)…` and delete it. */
function stripParenthesized(text: string): string {
  return text.replace(/[(（][^)）]*[)）]/g, " ");
}

describe("화면 글자 용어집 계약", () => {
  it("사정거리가 비어 있지 않다 — 빈손으로 통과하지 않는다", () => {
    for (const locale of LOCALES) {
      expect(
        Object.keys(MESSAGES[locale]).length,
        `${locale} 메시지를 하나도 못 읽었다`,
      ).toBeGreaterThan(1000);
    }
  });

  for (const { word, use, parenthesizedOk } of BANNED) {
    it(`화면에 ${word.source} 가 없다 — ${use} 를 쓴다`, () => {
      const hits: string[] = [];
      for (const locale of LOCALES) {
        for (const [key, text] of Object.entries(MESSAGES[locale])) {
          const subject = parenthesizedOk ? stripParenthesized(text) : text;
          if (word.test(subject)) hits.push(`${locale}:${key} — ${text.slice(0, 90)}`);
        }
      }
      expect(
        hits,
        `Screen copy still speaks in code terms. Replace it with "${use}" ` +
          `(canonical: docs/GLOSSARY.md).\n${hits.join("\n")}`,
      ).toEqual([]);
    });
  }

  /** The glossary document must exist so that error message guidance does not become a dead link. */
  it("the glossary document exists", () => {
    expect(existsSync(path.join(ROOT, "docs/GLOSSARY.md")), "docs/GLOSSARY.md is missing").toBe(true);
  });
});
