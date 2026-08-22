import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **There is one authoritative list of design Don'ts** — copies are subsets, and
 * they are matched by slug.
 *
 * ## Why this gate exists (2026-08-05 design-system audit)
 *
 * The same "absolute rules" list lived in **three places** and **no two of them
 * agreed**:
 *
 * | | Items | Something it had that others lacked |
 * |---|---|---|
 * | `docs/DESIGN-SYSTEM.md` | 14 | floating-box soup · stacked popovers · allowing overlap |
 * | `.claude/rules/forbidden.md` | 9 | — |
 * | `.claude/rules/design.md` | 8 | the glow boxShadow ring |
 *
 * And there was **no gate** reconciling them. `design.md` was missing the label
 * arrow and the card height — **both already backed by contract tests** — so a
 * copy was behind the spec and nobody knew. The discipline this repository wrote
 * down for skill copies had never been applied here: *"사본이 둘인데 게이트가
 * 없으면 어긋나는 쪽이 기본값이다"* (with two copies and no gate, drifting is the
 * default) — CLAUDE.md.
 *
 * ## Why slugs are compared rather than sentences
 *
 * `documentation.md` pins the rule: **never check a sentence a human wrote.** The
 * three files differ in language (Korean/English) and in detail — trying to match
 * sentences would ① fail because translations differ and ② break every time a
 * document is rewritten more clearly. So each item carries a `<!--dont:slug-->`
 * and this check looks at **the slug set only**. Sentences are free; slugs are the
 * contract.
 *
 * ## What is enforced
 *
 * 1. The authoritative list is not empty (a gate over an empty set is not a gate).
 * 2. Every slug in a copy exists in the authoritative list — a **subset**, not an
 *    equal set. `forbidden.md` is loaded every turn, so it deliberately carries
 *    fewer. Adding is free; only **writing something not in the authoritative
 *    list** is blocked.
 * 3. No slug is duplicated within one file.
 * 4. `design.md` points rather than lists — it must carry 0 slugs.
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

/** The authoritative list counts only slugs inside the "Absolute rules (Don'ts)" section — a slug used elsewhere must be visible. */
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
   * Self-verification — proves the assertions above do not pass merely because they
   * are not looking (`/gate-probe`: a 0 from a check that misses a planted violation
   * is not evidence).
   */
  it('프로브 — 고아 슬러그와 빈 정본을 실제로 잡는다', () => {
    const parse = (s: string) => [...s.matchAll(SLUG)].map((m) => m[1]);

    expect(parse('- a <!--dont:known-->\n- b <!--dont:rogue-->')).toEqual(['known', 'rogue']);
    expect(parse('금지 항목인데 슬러그가 없다')).toEqual([]);
    // Uppercase and underscores are not slugs — they must not slip through.
    expect(parse('<!--dont:Bad_Slug-->')).toEqual([]);

    const fakeCanon = new Set(['known']);
    const orphans = parse('- b <!--dont:rogue-->').filter((s) => !fakeCanon.has(s));
    expect(orphans, '고아 판정이 죽어 있으면 이 파일 전체가 무의미하다').toEqual(['rogue']);
  });
});
