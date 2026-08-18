import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **디자인 문서가 인용한 토큰이 실재하는가** (2026-08-15 (12)).
 *
 * ## 왜 이 검사가 필요한가 — 문서가 없는 것을 근거로 들고 있었다
 *
 * 호버 라운드(2026-08-15 (10))에서 게이트 감사가 이것을 지목했다:
 * `docs/DESIGN-SYSTEM.md` 가 `--topology-*-hover-*` 토큰 **13개**를
 * *"호버는 이미 토큰으로 뒷받침된다"* 는 근거로 나열하는데 **`app/globals.css`
 * 에 하나도 없다.** 그 전제로 감사를 시작하면 그 자체가 사각이 된다 — 실제로
 * 그 라운드가 한 번 헤맸다.
 *
 * 전수해 보니 호버만의 문제가 아니었다: 이 문서가 인용한 토큰 **393개 중
 * 190개가 저장소 어디에도 없다**(165개가 `--topology-*`). 원인은 **없어진
 * 화면의 토큰 목록이 그대로 남은 것**이다 — 「Relief/Topology layout tokens」
 * 절이 대표적이다.
 *
 * ## 왜 `docs:links` 가 못 잡았나
 *
 * 그 검사는 **파일 경로**의 실재를 본다. 토큰 이름은 경로가 아니라 문자열이라
 * 시야 밖이었다. `documentation.md` 가 허용하는 검사 세 갈래 중
 * **「가리키는 대상이 실재하는가」** 에 정확히 해당하는데, 그 갈래에 토큰이
 * 빠져 있었다.
 *
 * ## 왜 0 이 아니라 래칫인가
 *
 * 190을 지우려면 **어느 화면이 진짜 없어졌는지**를 절마다 판정해야 하고,
 * 그건 lint PR 이 아니라 문서 정리 작업이다(258KB 문서다). 그래서 지금은
 * **늘지 못하게만** 잠근다 — 새로 쓰는 문서가 없는 토큰을 근거로 드는 것은
 * 첫 건부터 빨갛다. 줄이면 바닥도 같이 내린다.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const DOC = readFileSync(path.join(ROOT, "docs/DESIGN-SYSTEM.md"), "utf8");

/** 오늘 실측. 늘면 빨개지고, 줄면 아래 「내려라」가 빨개진다. */
/**
 * 190 → 191 (2026-08-18). **토큰을 지웠기 때문에 올라간 값이다.**
 *
 * `--gateway-plate-width` 는 관문 설치 절이 사라지면서 소비처를 잃었고, 정의만
 * 남은 토큰은 규격이 아니라 오정보라 삭제했다(`unused-token-ratchet` 이 지키는
 * 성질). 그런데 원장의 **과거 기록**(2026-08-18 (70))이 그때의 사실로 그 이름을
 * 인용한다. 원장은 「덧붙이기만 한다 — 지난 기록을 고치지 않는다」가 계약이라,
 * 그 줄을 고쳐서 이 수를 되돌리는 것은 **게이트를 위해 사실을 지우는 일**이다.
 *
 * 그래서 올린다. 이 래칫이 지키는 것은 «살아 있는 규격 문서가 없는 토큰을
 * 근거로 들지 않는다» 이지 «과거 기록에 옛 이름이 없다» 가 아니다.
 */
const CEILING = 191;

/** `--x: value;` 로 **정의된** 이름 전부(중첩 블록·미디어 쿼리 포함). */
function definedTokens(): Set<string> {
  return new Set([...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/**
 * 문서가 **인용한** 토큰. 백틱 안과 `var(...)` 안만 본다 — 산문에 섞인
 * 접두사(`--chrome-` 처럼 뒤가 열린 것)는 이름이 아니라 **갈래를 가리키는
 * 말**이라 제외한다. 이 구분을 안 하면 접두사를 이름으로 잘못 읽어 수가
 * 부풀고, 그러면 래칫이 못 믿을 숫자를 지킨다(실측: 262 → 190).
 */
function citedTokens(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    for (const m of s.matchAll(/--[a-z][a-z0-9-]*/g)) {
      const t = m[0];
      if (!t.endsWith("-")) out.add(t);
    }
  };
  for (const m of DOC.matchAll(/`([^`\n]{0,200}?)`/g)) add(m[1]);
  for (const m of DOC.matchAll(/var\(([^)\n]*)\)/g)) add(m[1]);
  return out;
}

function missing(): string[] {
  const defined = definedTokens();
  return [...citedTokens()].filter((t) => !defined.has(t)).sort();
}

describe("디자인 문서의 토큰 참조 무결성", () => {
  const defined = definedTokens();
  const cited = citedTokens();
  const gone = missing();

  it("탐지기가 공회전하지 않는다 — 양쪽을 실제로 읽는다", () => {
    expect(defined.size, "globals.css 에서 토큰을 못 읽었다").toBeGreaterThan(400);
    expect(cited.size, "문서에서 인용을 못 읽었다").toBeGreaterThan(200);
    // 인용 중 **실재하는** 것이 다수여야 한다 — 아니면 정의 파싱이 깨진 것이다.
    expect(cited.size - gone.length, "실재하는 인용이 너무 적다 — 파서를 의심하라").toBeGreaterThan(150);
  });

  it("없는 토큰을 근거로 드는 자리가 늘지 않는다", () => {
    const byPrefix = new Map<string, number>();
    for (const t of gone) {
      const p = t.split("-").slice(0, 3).join("-");
      byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
    }
    const top = [...byPrefix.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `  ${n} ${p}-…`)
      .join("\n");
    expect(
      gone.length,
      `문서가 인용한 토큰 중 실재하지 않는 것이 ${CEILING} → ${gone.length} 로 늘었다.\n` +
        "새 토큰을 문서에 적을 때는 `app/globals.css` 에 **먼저** 넣어라.\n" +
        "이미 없어진 화면의 토큰을 적고 있다면 그 절을 지우는 것이 답이다.\n" +
        top,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("갚았으면 바닥도 내린다 — 여유를 무료로 두지 않는다", () => {
    expect(
      gone.length,
      `없는 토큰 인용이 줄었다(${gone.length}) — 위 CEILING 도 그 값으로 내려라.`,
    ).toBeGreaterThanOrEqual(CEILING);
  });

  it("접두사는 이름이 아니다 — 산문의 갈래 표기를 위반으로 세지 않는다", () => {
    /*
     * `/gate-probe`: 이 구분을 안 하면 수가 부풀고 래칫이 못 믿을 숫자를
     * 지킨다. 합성으로 증명한다.
     */
    const probe = (s: string) => {
      const out = new Set<string>();
      for (const m of s.matchAll(/--[a-z][a-z0-9-]*/g)) if (!m[0].endsWith("-")) out.add(m[0]);
      return [...out];
    };
    expect(probe("`--color-indigo-a12`"), "완전한 이름을 못 읽는다").toEqual(["--color-indigo-a12"]);
    expect(probe("`--chrome-` 계열"), "대시로 끝나는 접두사를 이름으로 읽는다").toEqual([]);
    /*
     * ⚠️ **한계를 사실대로 적는다.** `--color-danger-a` 처럼 **글자로 끝나는
     * 접두사**는 진짜 이름과 구별할 방법이 없다 — 프로브가 그것을 잡아냈다.
     * 그래서 이런 자리는 「없는 토큰」으로 **세인다**(과대 방향).
     *
     * 과대 쪽으로 트는 것은 래칫에서 안전하다: 상한이 조금 후해질 뿐 새
     * 위반을 놓치지 않는다. 반대로 과소 방향이면 진짜 위반이 상한 밑에
     * 숨는다. 「모르면 센다」가 이 저장소의 기본값이기도 하다(아이콘 래칫의
     * `SIZED_SLOT_OWNERS` 가 같은 선택을 했다).
     */
    expect(
      probe("`--color-danger-a` 단들"),
      "글자로 끝나는 접두사는 구별 불가라 세인다 — 그 사실이 바뀌면 상한도 다시 재라",
    ).toEqual(["--color-danger-a"]);
  });

  it("탐지기가 심은 위반을 잡는다 — 없는 토큰 하나를 넣으면 늘어난다", () => {
    const defined2 = definedTokens();
    const fake = "--this-token-does-not-exist-anywhere";
    expect(defined2.has(fake), "프로브 토큰이 실재하면 안 된다").toBe(false);
    const cited2 = new Set([...cited, fake]);
    const gone2 = [...cited2].filter((t) => !defined2.has(t));
    expect(gone2.length, "심은 가짜 토큰이 안 세인다").toBe(gone.length + 1);
  });
});
