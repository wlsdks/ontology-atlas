import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A grid must not be wider than its own frame.**
 *
 * ## Why this check exists (measured during the 2026-08-20 release review)
 *
 * The two-column grid on `/project/new/` and `/project/[slug]/edit/` was
 * `lg:grid-cols-[640px_260px]` + `gap-8` — **932px** in total. But the frame that
 * form lives in is `PAGE_FRAME_FORM` (max-w 960 + px-10), whose content box is
 * **880px**. So the right column sat 52px outside its container **at every screen
 * width** (including 1512), and below roughly 1092px of viewport it was clipped off
 * screen.
 *
 * ## Why not lint, and why not a browser check
 *
 * **lint cannot see it** — `grid-cols-[640px_260px]` and `max-w-[960px]` are each
 * perfectly legitimate strings. What is wrong is **putting them together**, and
 * they live in different files. A rule that sees one file's syntax tree cannot
 * express that.
 *
 * **It is decidable without a browser** — this is arithmetic. If fixed tracks plus
 * gaps exceed the content box, it overflows. So it is a contract test rather than
 * e2e (it finishes in milliseconds and does not vary by machine — the same reason
 * this repository forbids millisecond gates, pixel arithmetic is chosen here).
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** One step of Tailwind's spacing ramp = 4px. `gap-8` → 32px. */
const SPACING_STEP = 4;

/** Derives the content-box width from `max-w-[960px] … md:px-10`. */
function frameContentWidth(frameConst: string): number {
  const source = read('src/shared/ui/page-frame.ts');
  // The declaration is split across two lines (the string sits on the line after `= `). A line-wise search misses it.
  const declaration = new RegExp(`export const ${frameConst}\\s*=\\s*"([^"]+)"`).exec(source);
  if (!declaration) throw new Error(`${frameConst} 선언을 못 찾았다`);
  const classes = declaration[1];
  const max = /max-w-\[(\d+)px\]/.exec(classes);
  if (!max) throw new Error(`${frameConst} 에 max-w 리터럴이 없다`);
  // On wide screens the value that actually applies is `md:px-N`.
  const pad = /md:px-(\d+)/.exec(classes);
  const padPx = pad ? Number(pad[1]) * SPACING_STEP : 0;
  return Number(max[1]) - padPx * 2;
}

/**
 * Returns the whole **className string that declares the grid**.
 *
 * ⚠️ Do not search the whole file separately for tracks and gaps — the file has
 * several earlier gaps such as `gap-2`, and the first version really did pick one
 * up and **under-report** the gap as 8px instead of 32px (it still caught the
 * overflow, but the number was wrong, and a large enough discrepancy can let a real
 * overflow pass). Both are read from the same string.
 */
function gridClassName(source: string): string {
  const match = /className="([^"]*lg:grid-cols-\[[^\]]+\][^"]*)"/.exec(source);
  if (!match) throw new Error('className 안의 lg:grid-cols 리터럴을 못 찾았다');
  return match[1];
}

/** Sums only the **fixed-width tracks** of `lg:grid-cols-[A_B]` (`1fr` and `minmax` stretch). */
function fixedTrackWidth(source: string): { fixed: number; tracks: string[] } {
  /*
   * ⚠️ **Do not pick up the old value from a comment.** This file quotes the previous
   * value (`lg:grid-cols-[640px_260px]`) verbatim in a comment, and a regex sweeping
   * the whole source meets that first — which is exactly what happened the first time
   * this check was switched on. So only matches **inside a `className` string** are
   * considered.
   */
  const match = /lg:grid-cols-\[([^\]]+)\]/.exec(gridClassName(source));
  if (!match) throw new Error('lg:grid-cols 트랙을 못 읽었다');
  // `minmax(0,1fr)_260px` — count paren depth so commas inside are left alone.
  const tracks: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of match[1]) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '_' && depth === 0) {
      tracks.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  tracks.push(current);
  const fixed = tracks.reduce((sum, track) => {
    const px = /^(\d+)px$/.exec(track.trim());
    return sum + (px ? Number(px[1]) : 0);
  }, 0);
  return { fixed, tracks };
}

function gapWidth(source: string): number {
  // Only the gap inside the className that declares the grid (see the comment above).
  const match = /\bgap-(\d+)\b/.exec(gridClassName(source));
  return match ? Number(match[1]) * SPACING_STEP : 0;
}

describe('두 열 폼 격자 — 자기 틀 안에 들어가는가', () => {
  const form = read('src/features/project-edit/ui/ProjectForm.tsx');

  it('고정 트랙 + 간격이 틀의 내용 상자를 넘지 않는다', () => {
    const content = frameContentWidth('PAGE_FRAME_FORM');
    const { fixed, tracks } = fixedTrackWidth(form);
    const gap = gapWidth(form);
    expect(
      fixed + gap * (tracks.length - 1),
      `고정 트랙(${fixed}px) + 간격(${gap}px)이 틀의 내용 상자 ${content}px 를 넘는다 — ` +
        `오른쪽 열이 컨테이너 밖으로 나간다`,
    ).toBeLessThanOrEqual(content);
  });

  it('늘어나는 트랙이 하나는 있다 — 전부 고정이면 틀이 바뀔 때 다시 넘친다', () => {
    const { tracks } = fixedTrackWidth(form);
    expect(
      tracks.some((track) => /fr|minmax|auto/.test(track)),
      '모든 트랙이 고정 폭이다 — 틀이 좁아지면 그대로 넘친다',
    ).toBe(true);
  });

  it('검사기가 헛돌지 않는다 — 양쪽에서 실제로 값을 읽어 왔다', () => {
    // If the extractor silently returns 0, both tests above pass.
    expect(frameContentWidth('PAGE_FRAME_FORM')).toBeGreaterThan(400);
    // Must be 32px (`gap-8`). An 8 means a different gap in the file was picked up.
    expect(gapWidth(form)).toBe(32);
    expect(fixedTrackWidth(form).tracks.length).toBeGreaterThan(1);
  });
});
