import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **작대기(`—`) 래칫 — 사용자에게 보이는 글에서 더 늘지 못하게 막는다.**
 *
 * ## 왜 (2026-08-09 소유자 지적)
 *
 * > *"내 폴더 전체를 한눈에 — 모든 숫자는 문서에서 자동 계산됩니다 … 이거는 ai
 * > 패턴이거든? 이런거 있으면 다 변경해줘 작대기 안쓰도록"*
 *
 * 맞다. 「짧은 앞말 — 긴 설명」은 모델이 기본으로 쓰는 문장 모양이고, 사람이 쓴
 * 한국어 UI 문구는 대개 마침표로 끊는다.
 *
 * ## 왜 지금 다 안 고쳤나 — 전수를 세어 보고 내린 판단
 *
 * 실측: 문자열 3,206개 중 **501개**(ko 234 · en 267, 15.6%)가 작대기를 쓴다.
 * 모양별로 갈리고 **자리마다 답이 다르다**:
 *
 * | 모양 | 수 | 무엇으로 바꾸나 |
 * |---|---|---|
 * | 짧은 앞말 — 설명 (라벨꼴) | 282 | 마침표 · 줄바꿈 · 두 필드로 분리 |
 * | 문장 중간 1개 | 205 | 대개 마침표로 끊기 |
 * | 삽입구(2개 이상) | 11 | 문장을 다시 써야 한다 |
 * | **빈 값 표시 기호** | 2 | **건드리지 않는다** — 글이 아니라 기호다 |
 *
 * 487개를 기계로 일괄 치환하면 글이 망가진다 — 이 저장소는 문구를 사람이 판단해서
 * 쓰는 것으로 다루고, 그래서 문서 게이트도 「사람이 쓴 문장을 못박지 않는다」를
 * 규율로 갖는다. 그래서 **화면 단위로 나눠 고치고, 그동안 늘지만 못하게** 막는다.
 *
 * ⚠️ **줄었으면 상한도 같이 내린다.** 안 내리면 고친 만큼이 다시 여유가 된다.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * **0 이다 — 상한이 아니라 금지다** (2026-08-09 전수 정리 완료).
 *
 * 시작은 상한이었다(ko 232 · en 265). 화면 단위로 나눠 고치자던 계획을 소유자가
 * *"1번부터 전부다 완벽하게"* 로 바꿨고, 그래서 **494개를 전부 치웠다**:
 * 문장이 끝난 자리는 마침표, 이어지는 자리는 콜론, 삽입구는 괄호.
 *
 * 기계 치환이 망가뜨린 자리 **19건은 손으로** 고쳤다(삽입구 11 + 콜론이 두 번
 * 겹친 8). 그 19건이 이 일이 왜 일괄 치환으로 안 되는지의 증거다 —
 * `downloads: with their real sizes and checksums: appear here` 처럼 문법은
 * 멀쩡한데 뜻이 깨진다.
 *
 * **빈 값 표시용 `—` 하나는 센 데서 빠진다** — 그건 글이 아니라 기호다.
 */
const BASELINE = { ko: 0, en: 0 } as const;

/**
 * **글이 아니라 기호인 자리** — 값이 없다는 뜻의 대시 하나. 여기 있는 것은
 * 문장이 아니므로 이 래칫이 세지 않는다.
 */
function isPlaceholderGlyph(value: string): boolean {
  return value.trim() === "—";
}

function countEmDash(locale: "ko" | "en"): { strings: number; withDash: number } {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as unknown;
  let strings = 0;
  let withDash = 0;
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      strings += 1;
      if (node.includes("—") && !isPlaceholderGlyph(node)) withDash += 1;
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(raw);
  return { strings, withDash };
}

describe("작대기 래칫 — 사용자 문구", () => {
  for (const locale of ["ko", "en"] as const) {
    it(`${locale}: 작대기를 쓰는 문구가 늘지 않는다`, () => {
      const { strings, withDash } = countEmDash(locale);
      // 공회전 차단 — 파일을 못 읽고 「0건」으로 통과하는 것이 가장 나쁜 실패다.
      expect(strings, `${locale} 문구를 하나도 못 읽었다 — 이 래칫이 헛돈다`).toBeGreaterThan(
        2_000,
      );
      expect(
        withDash,
        `${locale} 문구에 작대기가 ${withDash}개 들어왔다.\n` +
          "「짧은 앞말 — 긴 설명」은 모델의 기본 문장 모양이다. 문장이 끝났으면 마침표, " +
          "이어지면 콜론, 삽입구는 괄호를 쓴다.\n" +
          "값이 없다는 뜻의 «—» 하나만 있는 문자열은 기호라서 안 센다.",
      ).toBeLessThanOrEqual(BASELINE[locale]);
      // 0 이므로 「줄었으면 내려라」 절이 필요 없다 — 더 내려갈 곳이 없다.
    });
  }
});

/**
 * **예시 볼트도 작대기를 안 쓴다** (2026-08-09).
 *
 * UI 문구 래칫을 걸어 두고 예시 볼트를 손보다가 **내가 그 자리에 작대기를 40개쯤
 * 새로 넣었다.** 래칫이 `messages/*.json` 만 보고 있었기 때문이다 — 그런데 사용자가
 * 읽는 글은 UI 문구만이 아니고, 예시 볼트는 **처음 온 사람이 읽는 유일한 데이터**다.
 *
 * 치우고 나니 0이 됐다. 0에서는 상한이 아니라 **금지**가 맞다.
 */
/**
 * **화면에 그려지는 문서에도 작대기가 없다** (2026-08-09 전수 정리).
 *
 * | 대상 | 어디에 그려지나 | 치운 수 |
 * |---|---|---|
 * | `samples/storefront/**` | 예시 볼트(처음 온 사람이 읽는 유일한 데이터) | 93 |
 * | `docs/guide/**` | `/guide` | 148 |
 * | `docs/ontology/**` | 볼트 노드 · 폴더 없는 사용자의 기본 매니페스트 | 105 |
 * | `docs/CHANGELOG.md` | `/changelog` | 1,722 |
 *
 * ## 무엇을 일부러 뺐나
 *
 * - **`docs/DECISIONS.md`** (2,158) — **덧붙이기만 하는 원장**이다. 자기 계약이
 *   「지난 기록을 고치지 않는다」라, 과거 기록의 문장을 다시 쓰는 것 자체가 규칙
 *   위반이다.
 * - **`AGENTS.md` · `DESIGN-SYSTEM.md` · `.claude/rules/**` · `FEATURES.md`** —
 *   에이전트와 우리가 읽는 문서다. 「AI 가 쓴 티가 난다」가 비용이 되는 자리는
 *   **사용자가 보는 화면**이고, 여기는 그 자리가 아니다.
 *
 * 즉 이 게이트의 경계는 「마크다운이냐」가 아니라 **「사용자가 읽나」** 다.
 */
describe("작대기 — 화면에 그려지는 문서", () => {
  const SAMPLE_ROOT = join(REPO_ROOT, "samples", "storefront");
  const RENDERED_DOC_ROOTS = [
    join(REPO_ROOT, "samples", "storefront"),
    join(REPO_ROOT, "docs", "guide"),
    join(REPO_ROOT, "docs", "ontology"),
  ];
  const RENDERED_DOC_FILES = [join(REPO_ROOT, "docs", "CHANGELOG.md")];

  const markdownFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...markdownFiles(full));
      else if (entry.name.endsWith(".md")) out.push(full);
    }
    return out;
  };

  it("화면에 그려지는 문서에 작대기가 없다", () => {
    const files = [...RENDERED_DOC_ROOTS.flatMap(markdownFiles), ...RENDERED_DOC_FILES];
    expect(files.length, "문서를 하나도 못 읽었다. 이 시험이 헛돈다").toBeGreaterThan(180);
    // 각 뿌리가 실제로 파일을 냈는지 — 하나가 0이어도 총계는 넘을 수 있다.
    for (const root of RENDERED_DOC_ROOTS) {
      expect(markdownFiles(root).length, `${root} 에서 문서를 못 읽었다`).toBeGreaterThan(5);
    }
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("—"))
      .map((file) => file.slice(REPO_ROOT.length + 1));
    expect(
      offenders,
      "화면에 그려지는 문서에 작대기가 들어왔다. 문장이 끝났으면 마침표, 이어지면 콜론, 삽입구는 괄호:\n" +
        offenders.join("\n"),
    ).toEqual([]);
    expect(SAMPLE_ROOT.length, "SAMPLE_ROOT 가 목록에서 빠졌다").toBeGreaterThan(0);
  });
});
