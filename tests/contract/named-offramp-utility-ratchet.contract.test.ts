import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Named Tailwind default-step ratchet — **the place where a comment confessed
 * there was no gate.**
 *
 * ## Why this file exists (2026-08-03 rules audit → 체계 seat)
 *
 * `eslint.config.mjs` had long claimed that the `type-ramp-coverage` ratchet holds
 * named steps. **That was false** — that ratchet's `ARBITRARY_SIZE` counts only
 * bracketed arbitrary patterns and never counts a named utility (`rounded-2xl`,
 * `text-xl`, …). On top of that it skips the directories eslint covers entirely,
 * and 18 of the 19 `rounded-2xl` uses were inside them — seen by neither lint nor
 * ratchet. The count is its own evidence: the comment recorded 12, it grew to 20,
 * and nothing turned red.
 *
 * ## Why a ratchet and not a lint extension
 *
 * The 11 `text-lg`-family uses sit inside lint-covered directories, so switching
 * the selector on turns CI red immediately. Substitution moves pixels (`text-xl`
 * at 20px is not any ramp step), so each place needs a design verdict, and holding
 * the count **from growing** while those verdicts are pending is a ratchet's job.
 * `rounded-sm` (59) and suffix-less `rounded` (37) reached **0** the same day by
 * registering `--radius-micro` (4px) and substituting mechanically throughout, and
 * an eslint selector holds them now — here they are only kept from returning
 * (baseline 0).
 *
 * Unlike `type-ramp-coverage`, this ratchet **does not skip eslint-covered
 * directories**: named utilities are outside that rule's range, so the covered /
 * uncovered distinction does not apply.
 */

/**
 * Per-family baselines — **they only go down.**
 *
 * A family at 0 does not mean "none exist"; it means re-entry is blocked.
 *
 * ## 2026-08-04: the last 24 were judged per place and all brought onto the ramp
 *
 * What remained had not stalled for lack of a value but because **each place
 * needed a design verdict**. The choice only became clear after measuring the
 * built screen:
 *
 * - **`rounded-2xl` (16px), 16 uses → all `rounded-panel` (12px).** The evidence
 *   was a radius inventory inside one drawer column: **six** radii — 20 / 18 / 16 /
 *   12 / 9 / 6 — were alive simultaneously in a single 399px-wide column, and only
 *   the `completeness`/`freshness` pair was already `rounded-panel`, so **siblings
 *   on the same row disagreed**. Dropping 16 to 12 separates the sheet tier
 *   (documented exceptions 18 and 20) from the content tier (12) and removes the
 *   flatness of 16/18/20 doing three different jobs while looking almost identical.
 *   `panel` (12) rather than `card` (9) because these boxes are section containers
 *   365–399px wide, and the two siblings that had already chosen, plus
 *   `TopologyEmptyState`'s override (`rounded-[var(--radius-panel)]`), gave the
 *   same answer.
 * - **`text-xl` (20px), 2 uses** — the drawer icon tile's emoji goes to
 *   `text-display` (23). On a 44px tile, 20px fills 54.5%, and the ramp neighbours
 *   are only 16 (36%) and 23 (52%), so the optically closer one won. The markdown
 *   preview's `h1` takes the same step — its line-height partner is 28px, the same
 *   as before, so line height does not move.
 * - **`text-lg` (18), 1 use · `text-base` (16), 1 use** — the markdown preview's
 *   h2/h3. The body is `text-body-lg` (14), so **the only ramp steps a heading can
 *   use are 16 and 23** (anything lower is smaller than the body and inverts the
 *   hierarchy). The ladder is therefore display 23 / title 16 / body-lg 14 (bold).
 * - **`text-2xl` and `text-3xl`, 1 use each** — the editor h1's
 *   `text-2xl md:text-3xl` becomes `text-display md:text-hero`. 24→23 is 1px and
 *   30→30 is 0px, and in exchange both sizes **gain a line-height partner**
 *   (32→28 · 36→34).
 *
 * **`text-lg`'s remaining 1 also reached 0 on 2026-08-05 — and it was a detector
 * defect, not debt.** That 1 was **prose in a comment** in `controls.tsx`, not a
 * rendered value, and the old comment described it as *"a floor that cannot be
 * lowered"*. It was not a floor: **the scanner was counting comments as values.**
 * Adding `stripComments` took it to 0.
 */
const FAMILIES: ReadonlyArray<readonly [name: string, re: RegExp, budget: number]> = [
  ['rounded (무접미, 4px)', /(?<![-\w])rounded(?![-\w])/g, 0],
  ['rounded-xs', /(?<![-\w])rounded-xs(?![-\w])/g, 0],
  ['rounded-sm', /(?<![-\w])rounded-sm(?![-\w])/g, 0],
  // 19 → 16 → 0. The 16 → 0 step is the 2026-08-04 per-place verdict above — all panel (12).
  ['rounded-2xl', /(?<![-\w])rounded-2xl(?![-\w])/g, 0],
  ['rounded-3xl', /(?<![-\w])rounded-3xl(?![-\w])/g, 0],
  ['text-xs', /(?<![-\w])text-xs(?![-\w])/g, 0],
  ['text-sm', /(?<![-\w])text-sm(?![-\w])/g, 0],
  ['text-base', /(?<![-\w])text-base(?![-\w])/g, 0],
  ['text-lg', /(?<![-\w])text-lg(?![-\w])/g, 0],
  ['text-xl', /(?<![-\w])text-xl(?![-\w])/g, 0],
  ['text-2xl', /(?<![-\w])text-2xl(?![-\w])/g, 0],
  ['text-3xl', /(?<![-\w])text-3xl(?![-\w])/g, 0],
  ['text-4xl', /(?<![-\w])text-4xl(?![-\w])/g, 0],
  /*
   * ## 2026-08-04: the line-height family — closing the last ungated hole of the three ramps
   *
   * Type and radius are held by this ratchet plus eslint's named-step selectors, but
   * **line height had no gate at all** — eslint sees only bracketed `leading-[N]`,
   * and named utilities (`leading-relaxed` 71 · `leading-snug` 17 …) passed through
   * no rule whatsoever. The same shape as the 268 `text-sm`/`rounded-md` uses
   * bypassing the ramp entirely.
   *
   * Inventory before switching it on (same conditions as this scanner, 2026-08-04):
   * relaxed 71 · numeric 103 · snug 17 · none 9 · tight 8 · normal 0 · loose 0 =
   * **208 places across some 40 files**. Too many for one PR — the value layer's
   * authority pins "line height is the partner of size", so substitution is not
   * mechanical: moving `leading-relaxed` (×1.625) to a partner step moves pixels
   * (measured 22.75→22 among others), and while `leading-4/5/6` (16/20/24px) can be
   * substituted pixel-identically, **which size they partner** has to be inspected
   * per place. So rather than repeating the `shadow-[` precedent (144→548 warnings
   * the moment it was switched on), a ratchet holds it and the work is staged:
   * re-entry is 0 from today, repayment goes to a per-place verdict round. The
   * substitution targets are the `--leading-*` ramp (caption…hero-lg ·
   * display-tight · prose).
   */
  /*
   * ## The ratio family also reached 0 on 2026-08-05 — and before that **the analysis was wrong**
   *
   * The first measurement of this family concluded "too risky, leave it", on the
   * strength of two numbers: 31 places of `relaxed + text-label` would lose
   * **−1.88px** (tightening) and the `leading-none` badge would gain **+4.50px**
   * (bursting its box). **Both calculations were wrong.**
   *
   * The cause: candidates were compared against **the 8 px steps only**. This ramp
   * also has **two ratio steps** — `--leading-display-tight` (1.06) and
   * `--leading-prose` (1.7). Adding them to the candidate set changes the answer:
   *
   * | Current | Adjacent type | With px steps only | With the whole ramp | Uses |
   * |---|---|---|---|---|
   * | relaxed | label(11)    | label — **−1.88** | **prose — +0.82** | 31 |
   * | none    | caption(9.5) | caption — **+4.50** | **display-tight — +0.57** | 6 |
   * | relaxed | caption(9.5) | label — +0.56 | same | 22 |
   * | snug    | label(11)    | label — +0.88 | same | 14 |
   *
   * **95 of 98 places move 1px or less, and none move more than 2px.** Neither the
   * tightening nor the bursting existed — the verdict had been reached after looking
   * at half the ramp.
   *
   * Lesson: **a narrow candidate set makes the movement look larger than it is, and
   * that number becomes the argument for not doing it.** When a ramp mixes units
   * (px and ratios), both must be in the candidate set when measuring. The same kind
   * of correction as limiting icon ties to an "adjacent two steps" window in this
   * round.
   *
   * Measured afterwards: across 12 routes, 0 change in document height · of 364
   * `data-testid` marks, 13 moved 2px or more (max 4px) · 0 moved 5px or more · 0
   * increase in horizontal overflow.
   */
  ['leading-none', /(?<![-\w])leading-none(?![-\w])/g, 0],
  ['leading-tight', /(?<![-\w])leading-tight(?![-\w])/g, 0],
  ['leading-snug', /(?<![-\w])leading-snug(?![-\w])/g, 0],
  ['leading-normal', /(?<![-\w])leading-normal(?![-\w])/g, 0],
  ['leading-relaxed', /(?<![-\w])leading-relaxed(?![-\w])/g, 0],
  ['leading-loose', /(?<![-\w])leading-loose(?![-\w])/g, 0],
  // The numeric forms (leading-4/5/6/7 …) are fixed px, so their values coincide
  // with ramp steps (16/20/24/28 = label/body/title/display), but they are names
  // with no partner decision behind them.
  // 103 → 86: restructuring "내 에이전트 연결" (connect my agent) on 2026-08-04
  // repaid 17 in that one file. The repayment was **deletion**, not substitution —
  // the size step already carries its own line height (the companion pairing), so
  // the second half of `text-label leading-4` was re-stating by hand what the ramp
  // already emits.
  /*
   * ## 2026-08-05: the numeric family went 86 → 0 with 0 pixel movement
   *
   * Tailwind's `leading-<n>` is `n × 4px`, and this repository's line-height ramp
   * **already had the same px values under names**:
   *
   *   leading-4 (16px) → leading-label · leading-5 (20px) → leading-body
   *   leading-6 (24px) → leading-title · leading-7 (28px) → leading-display
   *
   * So all 86 substitutions were **pixel-identical, though not byte-identical**. The
   * section above saying "substitution is not mechanical" was a judgement about the
   * **ratio family** (relaxed 1.625 · snug 1.375 …) and did not apply to the numeric
   * family — binding the two categories into one sentence was an over-generalisation.
   *
   * Partner measurement: 30 places were `text-X + leading-X`, matching the ramp's
   * default pairing, and 52 were deliberate overrides (for example 16px beside
   * `text-caption` (9.5) — looser than the default 14px for Korean body text). The
   * overrides keep their pixels too; the only change is that **an anonymous 20px
   * gained the name "body line height"**.
   */
  ['leading-<number>', /(?<![-\w])leading-\d+(?![-\w])/g, 0],
];

const ROOTS = ['src', 'app'] as const;

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      collect(p, out);
      continue;
    }
    /*
     * `.tsx` only. Including `.ts` catches English words in comments and prose as
     * violations ("rounded", and the `text-lg` the value layer's comment cites as
     * evidence) — measured on the first version: 13 false positives for suffix-less
     * rounded, all in comments or prose. Class strings live in component files, and
     * every real violation in the inventory was in a `.tsx`.
     */
    if (!name.endsWith('.tsx')) continue;
    if (name.includes('.test.') || name.includes('.spec.')) continue;
    out.push(p);
  }
}

/**
 * **Do not count comments as values** (2026-08-05).
 *
 * This ratchet scans source **as text**, so a comment explaining why a value must
 * not be used was caught as a violation the moment it named that value. That used
 * to be worked around through the baseline — `text-lg: 1` with its note that "the
 * remaining 1 is prose in a comment and is a floor that cannot be lowered" was the
 * confession. **It was not a floor; it was a defect in the detector.**
 *
 * The same disease appeared three times in this round: `unused-token-ratchet`
 * reading a comment mention of a token as "used" (under-reporting) ·
 * `implicit-bold-weight`'s first implementation counting the `<b>` in its own
 * doc-block as a violation (over-reporting) · and here. **A gate that scans source
 * as text must verify in both directions that it stripped comments.**
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function measure(): Map<string, { count: number; files: Map<string, number> }> {
  const files: string[] = [];
  for (const root of ROOTS) collect(join(process.cwd(), root), files);
  expect(files.length, '스캔이 비었다 — 빈 집합 위의 래칫은 게이트가 아니다').toBeGreaterThan(150);

  const result = new Map<string, { count: number; files: Map<string, number> }>();
  for (const [name] of FAMILIES) result.set(name, { count: 0, files: new Map() });
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const rel = relative(process.cwd(), file);
    for (const [name, re] of FAMILIES) {
      const hits = source.match(re)?.length ?? 0;
      if (hits === 0) continue;
      const bucket = result.get(name)!;
      bucket.count += hits;
      bucket.files.set(rel, hits);
    }
  }
  return result;
}

describe('이름 있는 off-ramp 유틸리티 래칫', () => {
  const actual = measure();

  it('패밀리별 부채가 기준선을 넘지 않는다', () => {
    const grown: string[] = [];
    for (const [name, , budget] of FAMILIES) {
      const bucket = actual.get(name)!;
      if (bucket.count > budget) {
        const top = [...bucket.files.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([f, n]) => `${f}(${n})`)
          .join(' · ');
        grown.push(`  ${name}: ${budget} → ${bucket.count} — ${top}`);
      }
    }
    expect(
      grown,
      `이름 있는 Tailwind 기본 스텝이 늘었다 — 램프 우회다.\n` +
        `크기는 text-caption…hero, 반경은 rounded-micro/chip/card/panel 로.\n${grown.join('\n')}`,
    ).toEqual([]);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    const lowered = FAMILIES.filter(([name, , budget]) => actual.get(name)!.count < budget).map(
      ([name, , budget]) => `  ${name}: 장부 ${budget} → 실측 ${actual.get(name)!.count}`,
    );
    expect(
      lowered,
      `부채가 줄었다. FAMILIES 의 기준선도 같이 내려라.\n${lowered.join('\n')}`,
    ).toEqual([]);
  });

  it('탐지기가 실제로 잡는다 — 위반 1줄 + 정상 1줄 프로브', () => {
    const violating =
      'className="rounded-sm rounded rounded-2xl text-xl text-sm md:text-3xl leading-relaxed leading-none leading-5"';
    const clean =
      'className="rounded-micro rounded-chip rounded-card rounded-panel rounded-sheet rounded-full text-caption text-label text-body-lg text-left leading-body leading-display-tight leading-prose"';
    const count = (s: string) =>
      FAMILIES.reduce((sum, [, re]) => sum + (s.match(re)?.length ?? 0), 0);
    expect(count(violating)).toBe(9);
    expect(count(clean)).toBe(0);
  });
});
