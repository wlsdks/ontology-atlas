import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";

/**
 * **호버 축 채택 래칫** — 손으로 쓴 호버가 늘지 못한다 (2026-08-15 (11)).
 *
 * ## 왜 이 래칫이 축과 같은 PR 에서 태어나는가
 *
 * 이 저장소의 부검 기록은 분명하다: `Card`/`Badge`/`DetailCard` 셋은 **소비처
 * 0** 으로 죽었고, 사인은 컴포넌트가 아니라 **게이트 없는 컴포넌트**였다.
 * 오늘 살아 있는 것들(Dialog · Checkbox · SegmentedControl · badgeClass)은
 * 전부 **이주와 래칫을 같은 라운드에** 지고 났다. 축도 같다 — 축만 만들고
 * 게이트를 안 걸면 다음 사람은 그냥 손으로 쓴다.
 *
 * ## 무엇을 세나
 *
 * `controlClass({ … })` **호출 블록 안**의 손 호버 선언
 * (`hover:text-` · `hover:bg-` · `hover:border-`). 호출 밖(네이티브 원소 ·
 * 호이스트 상수)은 **이 래칫의 관할이 아니다** — 그 자리는 애초에 값 층을
 * 안 거치므로 「축을 안 썼다」가 아니라 「컨트롤이 값 층 밖에 있다」는 다른
 * 부채이고, `control-adoption-ratchet` 의 계보다.
 *
 * ## 단위는 파일이 아니라 **선언**이다
 *
 * 2026-08-15 (9) 가 그것을 프로브로 배웠다 — 파일 단위로 세면 한 파일에 둘이
 * 있을 때 하나를 되돌려도 초록이었다. **래칫의 단위가 결함의 단위보다 굵으면
 * 그만큼 못 본다.**
 *
 * ## 오늘 값이 큰 이유 — 축이 덮지 않는 자리가 다수다
 *
 * 축은 실측 다수파만 갖는다(잉크 2단 · 면 1 · 보더 1). 남은 387은 대부분
 * ⓐ 인디고 계열 호버(값 층이 일부러 안 가진 축 — 틴트 단은 위계 판정) ⓑ
 * 조건부/`active` 자리(가드 판정이 자리마다 필요) ⓒ 축의 값과 다른 단.
 * **이 수가 0이 되는 것이 목표가 아니다** — 늘지 않는 것이 목표이고, 줄면
 * 바닥을 내린다.
 */

const ROOT = process.cwd();

/**
 * 오늘 실측. 늘면 빨개진다. 줄면 아래 「내려라」가 빨개진다.
 *
 * 387 → 386 (2026-08-17): 알림 종이 손으로 쓴 `controlClass({shape:'segment'})`
 * 버튼에서 `IconButton` 프리미티브로 옮겨 가면서 손 호버 선언 하나가 빠졌다.
 *
 * 381 → 376 (2026-08-21): 연결 시트가 은퇴했다(원장 90). 붙이는 일이 목적지가
 * 되면서 그 위젯이 통째로 사라졌고, 그 안의 손 호버 다섯도 같이 갔다. 고친 게
 * 아니라 **없어진 것**이라 이 줄에 그대로 적는다 — 다음 사람이 「누가 축으로
 * 옮겼나」를 찾다 헛수고하지 않게.
 *
 * 383 → 381 (2026-08-21): 설정 시트의 LNB 행 호버가 상수 하나로 모였다. 이정표
 * 행이 생기며 같은 문자열이 두 벌이 될 뻔했는데, 값 층의 `hoverSurface: 'lift'`
 * 는 행에 `overlay-1` 을 줘서 이 시트의 형제 행들(`overlay-2`)과 어긋난다 —
 * 축으로 옮기는 대신 **사본을 없앴다**. 늘지 않은 게 아니라 줄었다.
 *
 * 386 → 383 (2026-08-19): 관문의 설치 절이 통째로 삭제되면서 그 안의 손 호버
 * 선언 셋이 함께 갔다(`docs/DECISIONS.md` (83)). 축 채택이 는 것이 아니라
 * **자리가 없어진** 것이므로 이 감소는 공로가 아니다 — 그래도 바닥은 내린다.
 */
const CEILING = 376;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/** `controlClass({ … })` 를 중괄호 깊이로 끊는다 — `=>` 에서 잘리지 않게. */
function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

const HAND_HOVER = /hover:(?:text|bg|border)-\[color:var\(/g;

function scan() {
  const byFile = new Map<string, number>();
  let total = 0;
  let callsSeen = 0;
  let axisUsers = 0;

  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = stripComments(readFileSync(file, "utf8"));
      for (const block of callBlocks(src)) {
        callsSeen += 1;
        if (/hover(?:Ink|Surface|Border):/.test(block)) axisUsers += 1;
        const n = [...block.matchAll(HAND_HOVER)].length;
        if (n) {
          byFile.set(rel, (byFile.get(rel) ?? 0) + n);
          total += n;
        }
      }
    }
  }
  return { byFile, total, callsSeen, axisUsers };
}

describe("호버 축 채택 래칫", () => {
  const census = scan();

  it("탐지기가 공회전하지 않는다 — 호출을 실제로 끊고 축 소비처가 실재한다", () => {
    expect(census.callsSeen, "controlClass 호출을 못 끊었다 — 파서가 죽었다").toBeGreaterThan(200);
    /*
     * **축에 소비처가 있어야 한다.** 이 저장소가 세 부품을 소비처 0 으로
     * 죽인 뒤 세운 규율이다 — 「소비처 0 선택지는 규격이 아니라 오정보」.
     * 이 단언이 0 이 되는 날은 축이 죽은 날이다.
     */
    expect(census.axisUsers, "호버 축을 쓰는 호출이 없다 — 축이 소비처 0 이다").toBeGreaterThan(20);
  });

  it("손으로 쓴 호버가 늘지 않는다", () => {
    expect(
      census.total,
      `손 호버 선언이 ${CEILING} → ${census.total} 로 늘었다.\n` +
        "값 층이 세 축을 갖고 있다 — `hoverInk`('strong'|'secondary') · " +
        "`hoverSurface`('lift') · `hoverBorder`('strong'). 그 값이면 축을 쓰고,\n" +
        "다른 값이 필요하면 **왜 다른지**를 먼저 대라(인디고 틴트 단은 값이 아니라 위계 판정이다).\n" +
        [...census.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(CEILING);
  });

  it("갚았으면 바닥도 내린다 — 여유를 무료로 두지 않는다", () => {
    expect(
      census.total,
      `손 호버 선언이 줄었다(${census.total}) — 위 CEILING 도 ${census.total} 로 내려라.`,
    ).toBeGreaterThanOrEqual(CEILING);
  });

  it("탐지기가 심은 위반을 잡고 축 사용은 안 잡는다", () => {
    const hand = `controlClass({ shape: 'chip', className: 'hover:text-[color:var(--color-text-primary)]' })`;
    const axis = `controlClass({ shape: 'chip', hoverInk: 'strong' })`;
    const outside = `<button className="hover:text-[color:var(--color-text-primary)]" />`;
    const count = (s: string) =>
      callBlocks(s).reduce((a, b) => a + [...b.matchAll(HAND_HOVER)].length, 0);

    expect(count(hand), "손 호버를 못 잡는다").toBe(1);
    expect(count(axis), "축 사용을 위반으로 센다 — 그러면 쓸 이유가 사라진다").toBe(0);
    expect(count(outside), "호출 밖은 이 래칫의 관할이 아니다").toBe(0);
  });
});
