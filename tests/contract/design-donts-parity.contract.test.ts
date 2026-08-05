import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **디자인 금지 목록은 정본 하나다** — 사본은 부분집합이고, 슬러그로 짝을 맞춘다.
 *
 * ## 왜 이 게이트가 생겼나 (2026-08-05 디자인 시스템 감사)
 *
 * 같은 「절대 하지 말 것」 목록이 **세 곳**에 있었고 **어느 둘도 일치하지
 * 않았다**:
 *
 * | | 항목 수 | 남이 없는 것을 갖고 있던 예 |
 * |---|---|---|
 * | `docs/DESIGN-SYSTEM.md` | 14 | 떠 있는 상자 수프 · 겹친 팝오버 · 겹침 허용 |
 * | `.claude/rules/forbidden.md` | 9 | — |
 * | `.claude/rules/design.md` | 8 | glow boxShadow 링 |
 *
 * 그리고 셋을 맞춰 주는 게이트가 **없었다**. `design.md` 에는 `라벨 화살표` 와
 * `카드 높이` 가 빠져 있었는데 **둘 다 이미 계약 테스트까지 있는 규격**이다 —
 * 즉 사본이 규격보다 뒤처져 있었고 아무도 몰랐다. 이 저장소가 스킬 사본에 대해
 * 스스로 적어 둔 규율이 여기엔 적용되지 않았던 것이다: *"사본이 둘인데 게이트가
 * 없으면 어긋나는 쪽이 기본값이다"*(CLAUDE.md).
 *
 * ## 왜 문장이 아니라 슬러그를 비교하나
 *
 * `documentation.md` 가 못박아 둔 규칙: **사람이 판단해서 쓴 문장은 검사하지
 * 않는다.** 세 파일은 언어도 다르고(한국어/영어) 상세함도 다르다 — 문장을
 * 맞추려 들면 ① 번역이 다르다는 이유로 실패하고 ② 문서를 더 나은 표현으로
 * 고칠 때마다 깨진다. 그래서 각 항목이 `<!--dont:slug-->` 를 달고, 이 검사는
 * **슬러그 집합만** 본다. 문장은 자유, 슬러그는 계약.
 *
 * ## 무엇을 강제하나
 *
 * 1. 정본이 비어 있지 않다 (공집합 위의 게이트는 게이트가 아니다).
 * 2. 사본의 모든 슬러그가 정본에 있다 — **부분집합**이지 동일집합이 아니다.
 *    `forbidden.md` 는 매 턴 실리므로 일부러 적게 싣는다. 늘리는 것은 자유고,
 *    **정본에 없는 것을 쓰는 것**만 막는다.
 * 3. 한 파일 안에서 슬러그가 중복되지 않는다.
 * 4. `design.md` 는 목록을 갖지 않고 가리킨다 — 슬러그 0개여야 한다.
 */

const ROOT = process.cwd();

const CANON = 'docs/DESIGN-SYSTEM.md';
const RESIDENT = '.claude/rules/forbidden.md';
const CONDITIONAL = '.claude/rules/design.md';

const SLUG = /<!--dont:([a-z0-9-]+)-->/g;

function slugsIn(rel: string): string[] {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  return [...src.matchAll(SLUG)].map((m) => m[1]);
}

/** 정본은 "Absolute rules (Don'ts)" 절 안의 것만 센다 — 다른 절이 슬러그를 쓰면 알아야 한다. */
function canonSection(): string {
  const src = readFileSync(path.join(ROOT, CANON), 'utf8');
  const start = src.indexOf("## Absolute rules (Don'ts)");
  expect(start, `${CANON} 에 "Absolute rules (Don'ts)" 절이 없다 — 정본이 사라졌거나 제목이 바뀌었다`).toBeGreaterThan(-1);
  const next = src.indexOf('\n## ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('디자인 금지 목록 — 정본 하나 + 부분집합 사본', () => {
  const canonList = [...canonSection().matchAll(SLUG)].map((m) => m[1]);
  const canon = new Set(canonList);

  it('정본이 비어 있지 않다 — 공집합 위의 게이트는 게이트가 아니다', () => {
    expect(canonList.length).toBeGreaterThanOrEqual(15);
    expect(canon.size, '정본 안에 같은 슬러그가 두 번 있다').toBe(canonList.length);
  });

  it('정본의 슬러그가 그 절 밖으로 새지 않는다', () => {
    const whole = slugsIn(CANON);
    expect(
      whole.length,
      `${CANON} 의 "Absolute rules" 절 밖에서 dont 슬러그가 쓰였다 — 정본이 둘이 된다`,
    ).toBe(canonList.length);
  });

  it.each([RESIDENT, CONDITIONAL])('%s 의 슬러그는 전부 정본에 있다 (부분집합)', (rel) => {
    const mine = slugsIn(rel);
    const orphans = mine.filter((s) => !canon.has(s));
    expect(
      orphans,
      `정본(${CANON})에 없는 금지를 사본이 들고 있다. 정본에 먼저 등재하라.\n` +
        `고아 슬러그: ${orphans.join(', ')}`,
    ).toEqual([]);
    expect(new Set(mine).size, `${rel} 안에 같은 슬러그가 두 번 있다`).toBe(mine.length);
  });

  it('상주 사본은 실제로 무언가를 싣는다 — 포인터만 남으면 「파일 열기 전」 보호가 사라진다', () => {
    expect(slugsIn(RESIDENT).length).toBeGreaterThanOrEqual(8);
  });

  it('조건부 사본은 목록을 갖지 않고 가리킨다', () => {
    expect(
      slugsIn(CONDITIONAL),
      `${CONDITIONAL} 는 금지 목록을 베끼지 않는다 — 정본을 가리키기만 한다(「노드 규격」 절과 같은 방식).`,
    ).toEqual([]);
    const src = readFileSync(path.join(ROOT, CONDITIONAL), 'utf8');
    expect(src, `${CONDITIONAL} 가 정본을 가리키지 않는다`).toContain("Absolute rules (Don'ts)");
  });

  /**
   * 자기검증 — 위 단언들이 «안 보고 있어서» 통과하는 것이 아님을 증명한다
   * (`/gate-probe`: 심어 둔 위반을 못 잡는 검사의 0건은 증거가 아니다).
   */
  it('프로브 — 고아 슬러그와 빈 정본을 실제로 잡는다', () => {
    const parse = (s: string) => [...s.matchAll(SLUG)].map((m) => m[1]);

    expect(parse('- a <!--dont:known-->\n- b <!--dont:rogue-->')).toEqual(['known', 'rogue']);
    expect(parse('금지 항목인데 슬러그가 없다')).toEqual([]);
    // 대문자·언더스코어는 슬러그가 아니다 — 오탐으로 통과시키면 안 된다.
    expect(parse('<!--dont:Bad_Slug-->')).toEqual([]);

    const fakeCanon = new Set(['known']);
    const orphans = parse('- b <!--dont:rogue-->').filter((s) => !fakeCanon.has(s));
    expect(orphans, '고아 판정이 죽어 있으면 이 파일 전체가 무의미하다').toEqual(['rogue']);
  });
});
