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
 * down for skill copies had never been applied here: *"With two copies and no gate,
 * drifting is the default"* — the root instruction file.
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
  expect(start, `${CANON} has no "Absolute rules (Don'ts)" section — the canon vanished or the heading changed`).toBeGreaterThan(-1);
  const next = src.indexOf('\n## ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('design prohibition list — one canon + subset copies', () => {
  const canonList = [...canonSection().matchAll(SLUG)].map((m) => m[1]);
  const canon = new Set(canonList);

  // Floor of 8: the structural rows. The resident copy carries three of them.
  it('the canon is not empty — a gate on an empty set is not a gate', () => {
    expect(canonList.length).toBeGreaterThanOrEqual(8);
    expect(canon.size, 'the same slug appears twice in the canon').toBe(canonList.length);
  });

  it('slugs of the canon do not leak outside that section', () => {
    const whole = slugsIn(CANON);
    expect(
      whole.length,
      `a dont slug was used outside the "Absolute rules" section of ${CANON} — the canon becomes two`,
    ).toBe(canonList.length);
  });

  it.each([RESIDENT, CONDITIONAL])('every slug of %s is in the canon (subset)', (rel) => {
    const mine = slugsIn(rel);
    const orphans = mine.filter((s) => !canon.has(s));
    expect(
      orphans,
      `A copy carries a ban the canonical list (${CANON}) does not have. Add it to the canonical list first.\n` +
        `Orphan slugs: ${orphans.join(', ')}`,
    ).toEqual([]);
    expect(new Set(mine).size, `the same slug appears twice in ${rel}`).toBe(mine.length);
  });

  it('the resident copy really carries something — if only a pointer remains the "before opening a file" protection disappears', () => {
    expect(slugsIn(RESIDENT).length).toBeGreaterThanOrEqual(3);
  });

  it('the conditional copy has no list and only points', () => {
    expect(
      slugsIn(CONDITIONAL),
      `${CONDITIONAL} does not copy the prohibition list — it only points at the canon (the same way as the "node spec" section).`,
    ).toEqual([]);
  });

  /**
   * Self-verification — proves the assertions above do not pass merely because they
   * are not looking (`/gate-probe`: a 0 from a check that misses a planted violation
   * is not evidence).
   */
  it('probe — really catches orphan slugs and an empty canon', () => {
    const parse = (s: string) => [...s.matchAll(SLUG)].map((m) => m[1]);

    expect(parse('- a <!--dont:known-->\n- b <!--dont:rogue-->')).toEqual(['known', 'rogue']);
    expect(parse('금지 항목인데 슬러그가 없다')).toEqual([]);
    // Uppercase and underscores are not slugs — they must not slip through.
    expect(parse('<!--dont:Bad_Slug-->')).toEqual([]);

    const fakeCanon = new Set(['known']);
    const orphans = parse('- b <!--dont:rogue-->').filter((s) => !fakeCanon.has(s));
    expect(orphans, 'if the orphan judgement is dead this whole file is meaningless').toEqual(['rogue']);
  });
});
