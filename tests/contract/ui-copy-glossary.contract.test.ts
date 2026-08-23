import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 화면 글자에 코드 말투가 다시 새는 것을 막는다 — 정본은 `docs/GLOSSARY.md`.
 *
 * ## 왜 생겼나 (2026-08-22)
 *
 * 소유자가 화면과 설명을 읽고 말했다 — *"이런거 니가 말하는거 보는 내가
 * 알아들을수있는게 하나도없음!"*. 재 보니 사람이 읽는 글자 3,130개 중
 * **23군데**가 코드 말투 그대로였다: `frontmatter` 13 · `엣지` · `핸들` ·
 * `파싱` · `렌더링` · `쿼리` · `계약` · `인덱스` · `메타데이터`.
 *
 * 같은 감사가 **영어 화면이 존재하지 않는 명령을 시키던 것**도 잡았다 —
 * `pnpm folder:validate` 는 `package.json` 에 없다(있는 것은 `vault:validate`
 * 하나뿐). 그래서 이 시험은 낱말만이 아니라 **화면이 시키는 명령이 실재하는지**
 * 도 같이 잰다: 낱말을 쉽게 고쳐도 없는 명령을 시키면 사용자는 똑같이 막힌다.
 *
 * ## 왜 코드 주석은 안 보나
 *
 * 거기서는 그 낱말들이 **옳기** 때문이다. 「게이트」를 「위반을 자동으로 막는
 * 검사」로 매번 풀어 쓰면 길어지기만 하고 뜻은 그대로다. 사정거리는
 * `messages/*.json` — 사람이 화면에서 읽는 글자 — 하나다.
 *
 * ## 면제가 왜 필요한가
 *
 * 두 자리는 낱말을 지우면 못 쓰게 된다.
 *
 * - **사용자가 그대로 입력하는 값** — `kind: project` 는 문장이 아니라 코드다.
 * - **찾아야 하는 낱말** — 오류 안내에서 `frontmatter` 를 통째로 지우면
 *   사용자가 그 말로 검색을 못 한다. `GLOSSARY.md` 의 괄호 규칙이 그래서
 *   있고, 여기서는 **괄호 안에 든 것만** 통과시킨다.
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
 * 화면에서 쓰지 않는 낱말 — `docs/GLOSSARY.md` 의 표에서 온다.
 *
 * `frontmatter` 는 **괄호 안에서만** 산다(괄호 규칙). 나머지는 아예 안 쓴다.
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

/** `…(frontmatter)…` 처럼 괄호에 싸인 등장만 남기고 지운다. */
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
   * 화면이 시키는 `pnpm <script>` 는 **실재해야 한다.**
   *
   * 영어 화면이 `pnpm folder:validate` 를 시키고 있었는데 그런 스크립트는 없다
   * (2026-08-22 실측). 낱말을 아무리 쉽게 고쳐도 없는 명령을 시키면 사용자는
   * 같은 자리에서 막힌다 — 쉬운 말과 맞는 말은 다른 문제이고 둘 다 필요하다.
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

  /** 용어집 문서가 실재해야 오류 메시지의 안내가 죽은 링크가 되지 않는다. */
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
