import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 파일 주소가 CSS `uppercase` 로 값까지 대문자 변형되는 것을 막는 게이트.
 *
 * 2026-08-14 전수조사에서 11곳이 나왔다: slug · 경로 리터럴 · 폴더명 같은
 * **값**이 아이브로우/메타 라벨의 `uppercase` 원소 안에 그대로 들어가
 * `docs/ontology` 가 `DOCS/ONTOLOGY` 로 보이고 있었다. 값은 주소다 —
 * 대소문자를 바꾸면 다른 주소가 된다. 처방은 둘 중 하나다:
 *
 * 1. 원소 전체가 값이면 `uppercase`(와 caps tracking)를 뺀다.
 * 2. 라벨+값 혼합이면 값을 `normal-case tracking-normal` span 으로 감싼다
 *    (선례: `src/widgets/full-detail-a1/ui/FullDetailA1.tsx` 의 sourceKind).
 *    i18n interpolation 은 메시지에 `<value>` 태그를 넣고 `t.rich` 로
 *    normal-case 렌더러를 붙인다 (선례: footerSummary · footerUpdated ·
 *    editorEyebrow).
 *
 * ## 판정이 문자열 휴리스틱이라는 한계 (정직하게 적는다)
 *
 * 이 시험은 JSX 를 파싱하지 않는다. `uppercase` 가 든 클래스 문자열 줄에서
 * 아래로 최대 12줄(첫 닫는 태그 `</` 까지)을 창으로 잡고, 그 안의 경로성
 * 표현식을 찾는다. 그래서:
 *
 * - **놓치는 것**: 창(12줄) 밖의 자식, 중첩 자식 원소 뒤에 오는 값,
 *   변수로 뽑아 둔 클래스 문자열과 렌더 위치가 먼 경우,
 *   `md:uppercase`/`[&_th]:uppercase` 같은 변형 프리픽스(마크다운 표 th 는
 *   의도된 경계 — 별도 판단), `t.rich` 렌더러가 실제로 normal-case 인지.
 * - **면제 신호**: 창 안에서 `normal-case` 또는 `t.rich(` 가 나온 뒤의
 *   매치는 건너뛴다 — 위 처방 2 의 정상 패턴이기 때문이다.
 *
 * 놓칠 수는 있어도 오탐으로 정당한 코드를 막지는 않는 쪽으로 좁혔다.
 * 새 우회 패턴이 생기면 여기 창 규칙을 넓히고 프로브로 빨강을 확인하라.
 */

/** 클래스 문자열 안의 standalone uppercase (변형 프리픽스 `:uppercase` 제외). */
const UPPERCASE_IN_STRING = /(["'`])[^"'`\n]*(?<!:)\buppercase\b[^"'`\n]*\1/;

/** JSX 자식 표현식 속 경로성 값: 멤버 .slug/.path/.relativePath/.ref, 바어 slug, node.name */
const PATH_EXPR =
  /\{[^{}]*?(?:\.(?:slug|path|relativePath|ref)\b|(?<![\w$.])slug(?![\w$:])|\bnode\.name\b)[^{}]*?\}/;

/** t() interpolation 에 slug/path 를 넘기는 호출 (t.rich 는 처방 2 라 제외). */
const T_CALL = /(?<![.\w])t\(\s*["'][^"']+["']\s*,\s*\{[^}]*\b(?:slug|path)\b\s*:/;

const WINDOW = 12;

function walkTsx(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
}

interface Offence {
  file: string;
  line: number;
  snippet: string;
}

describe("uppercase 원소 안의 경로성 값 — 주소는 대문자 변형하지 않는다", () => {
  it("src/**/*.tsx 의 uppercase 원소 자식에 slug/path/폴더명 값이 없다", () => {
    const root = process.cwd();
    const files: string[] = [];
    walkTsx(join(root, "src"), files);

    const offences: Offence[] = [];
    let uppercaseSites = 0;

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!UPPERCASE_IN_STRING.test(lines[i])) continue;
        uppercaseSites++;

        // 창: uppercase 줄부터 첫 닫는 태그(`</`)가 있는 줄까지, 최대 WINDOW 줄.
        const windowLines: string[] = [];
        for (let j = i; j < Math.min(i + WINDOW, lines.length); j++) {
          windowLines.push(lines[j]);
          if (j > i && (lines[j].includes("</") || lines[j].includes("/>"))) break;
        }
        let text = windowLines.join("\n");

        // 처방 2 의 정상 패턴 뒤는 면제: normal-case span · t.rich 값 렌더러.
        const cutAt = Math.min(
          ...["normal-case", "t.rich("]
            .map((marker) => text.indexOf(marker))
            .filter((idx) => idx >= 0),
        );
        if (Number.isFinite(cutAt)) text = text.slice(0, cutAt);

        const match = PATH_EXPR.exec(text) ?? T_CALL.exec(text);
        if (match) {
          offences.push({
            file: file.slice(root.length + 1),
            line: i + 1,
            snippet: match[0].replace(/\s+/g, " ").slice(0, 80),
          });
        }
      }
    }

    // 게이트가 스스로 살아있음을 증명한다 — 스캔이 깨져 0건을 읽으면
    // "위반 없음" 이 아니라 이 단언이 먼저 터진다.
    expect(files.length, "src 의 .tsx 파일 수").toBeGreaterThan(100);
    expect(uppercaseSites, "uppercase 클래스 문자열 사용처 수").toBeGreaterThan(100);

    const report = offences
      .map((o) => `  ${o.file}:${o.line} → ${o.snippet}`)
      .join("\n");
    expect(
      offences,
      offences.length === 0
        ? ""
        : `slug · 경로 · 폴더명은 주소다 — uppercase 로 변형하면 다른 주소가 된다.\n` +
            `원소 전체가 값이면 uppercase 를 빼고, 라벨+값 혼합이면 값을\n` +
            `normal-case tracking-normal span(또는 <value> 태그 + t.rich)으로 감싸라.\n${report}`,
    ).toEqual([]);
  });
});
