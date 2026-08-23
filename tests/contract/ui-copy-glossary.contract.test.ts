import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Prevents code-style phrasing from seeping back into on-screen text — the canonical source is `docs/GLOSSARY.md`.
 *
 * ## Why it was created (2026-08-22)
 *
 * The owner read the screen and documentation and said — *"I can't understand a single thing you're saying!"*. Upon review, **23 instances** of code-style phrasing remained among 3,130 characters of human-readable text: `frontmatter` 13 · `edge` · `handle` ·
 * `parsing` · `rendering` · `query` · `contract` · `index` · `metadata`.
 *
 * The same audit also caught **commands for which no English screen exists** —
 * `pnpm folder:validate` is not in `package.json` (only `vault:validate` exists). So this test measures not just words but **whether the commands invoked by the screens actually exist**: even if words are easily corrected, invoking a non-existent command blocks the user just as much.
 *
 * ## Why code comments are not checked
 *
 * Because those words are **correct** there. Expanding "gate" to "an inspection that automatically blocks violations" every time would only make it longer without changing the meaning. The scope is
 * `messages/*.json` — one file containing text read by humans on screens.
 *
 * ## Why exemptions are necessary
 *
 * There are two places where removing the words makes them unusable.
 *
 * - **Values entered directly by users** — `kind: project` is code, not a sentence.
 * - **Words that must be found** — removing `frontmatter` entirely from error messages
 *   prevents users from searching for that term. That's why the `GLOSSARY.md` parenthesis rule exists, and here we **only allow what is inside parentheses**.
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
  glossaryMarker: RegExp;
  parenthesizedOk?: boolean;
}> = [
  { word: /frontmatter/i, use: "파일 맨 위 정보칸 / the info block at the top", glossaryMarker: /frontmatter/i, parenthesizedOk: true },
  { word: /프론트매터/, use: "파일 맨 위 정보칸", glossaryMarker: /frontmatter/i },
  { word: /문서 상단 속성|문서 속성/, use: "파일 맨 위 정보칸 — 같은 것을 세 이름으로 부르고 있었다", glossaryMarker: /frontmatter/i },
  { word: /엣지/, use: "연결", glossaryMarker: /\bedge\b/i },
  { word: /렌더링/, use: "화면에 그리다", glossaryMarker: /\brender\b/i },
  { word: /파싱/, use: "읽어 들이다", glossaryMarker: /\bparse\b/i },
  { word: /쿼리/, use: "검색어", glossaryMarker: /\bquery\b/i },
  { word: /메타데이터/, use: "기본 정보", glossaryMarker: /\bmetadata\b/i },
  { word: /(^|[^가-힣])인덱스/, use: "검색 준비", glossaryMarker: /\bindex\b/i },
];

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
        `화면 글자에 코드 말투가 남아 있다. 「${use}」로 바꾼다 ` +
          `(정본: docs/GLOSSARY.md).\n${hits.join("\n")}`,
      ).toEqual([]);
    });
  }

  /**
   * The `pnpm <script>` called on screen **must actually exist.**
   *
   * The English screen was calling `pnpm folder:validate`, but that script does not
   * exist (measured 2026-08-22). No matter how simply you word it, if the command
   * doesn't exist, the user hits a wall in the same place — simplicity and correctness
   * are different problems, and both are needed.
   */
  it("화면이 시키는 pnpm 명령이 package.json 에 실재한다", () => {
    const scripts = Object.keys(
      (JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts ?? {},
    );
    expect(scripts.length, "package.json 스크립트를 못 읽었다").toBeGreaterThan(10);

    const missing: string[] = [];
    let seen = 0;
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(MESSAGES[locale])) {
        for (const [, name] of text.matchAll(/pnpm\s+([a-z][a-z0-9:-]*)/gi)) {
          seen += 1;
          if (!scripts.includes(name)) missing.push(`${locale}:${key} — pnpm ${name}`);
        }
      }
    }
    expect(seen, "화면에서 pnpm 명령을 하나도 못 찾았다 — 이 시험이 헛돌고 있다").toBeGreaterThan(0);
    expect(
      missing,
      `화면이 없는 명령을 시킨다:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  /** The glossary document must exist so that error message guidance does not become a dead link. */
  it("정본 문서가 실재하고 표를 갖고 있다", () => {
    const glossary = read("docs/GLOSSARY.md");
    expect(glossary).toContain("the info block at the top of the file");
    for (const { word, glossaryMarker } of BANNED) {
      expect(
        glossary,
        `${word.source} 가 용어집 표에 없다 — 게이트만 있고 근거가 없다`,
      ).toMatch(glossaryMarker);
    }
  });
});
