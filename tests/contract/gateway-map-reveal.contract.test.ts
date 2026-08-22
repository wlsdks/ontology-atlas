import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * **The gateway map must arrive — it must not simply appear.**
 *
 * This page's only sales argument is "this is a live engine, not a picture", and
 * that argument is either proved or lost in the first frame.
 *
 * The engine already has an arrival choreography — P3d(E1) in
 * `use-topology-loop.ts`: every node gathers at the project node's home and then
 * settles into place on a homing spring (critically damped, with a reduced-motion
 * snap built in). An existing mechanism requiring zero new motion contract.
 *
 * ⚠️ But while `StageMap` passed `revealToken={1}` as a **constant**, that
 * choreography **never once fired.** The engine's comparison baseline
 * (`lastRevealTokenRef`) starts at 0, so the first mount swallows the increment
 * whole — a pattern that file's own comment warns about. Measured 2026-07-29 by
 * rAF pixel diff: the canvas produced the finished map in **one hard-cut frame**.
 *
 * After the fix: 453 frames of non-zero diff over 3775ms, first third averaging
 * 161.1 and last third 3.7 (monotonic decay). Under reduced-motion, 1 frame and a
 * 0ms window (a snap).
 *
 * **Why a source contract.** This defect is the textbook case of the layer where
 * **the value is correct and nothing catches it** — the constant `1` type-checks,
 * passes lint, and leaves no literal in the render output. It was dead only on
 * screen. Measuring a pixel time series is most accurate but costs an e2e, and the
 * regression's **shape** narrows to one thing: pinning the token to a literal.
 * That shape is what is blocked.
 */
/**
 * Looks at **code only**, with comments stripped, because both this file and the
 * source **quote** `revealToken={1}` as the regression case. Counting a quotation
 * as a violation lets the detector trip on its own documentation (the same reason
 * the label-decoration gate judges by position rather than glyph).
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('관문 지도의 도착 안무', () => {
  const stage = codeOnly(read('src/views/download/ui/StageMap.tsx'));

  it('revealToken 을 리터럴로 고정하지 않는다', () => {
    // Constants such as `revealToken={1}` / `revealToken={0}` are swallowed by mount.
    expect(stage).not.toMatch(/revealToken=\{\s*\d+\s*\}/);
    expect(stage).toMatch(/revealToken=\{revealToken\}/);
  });

  it('0 에서 시작해 마운트 뒤에 올린다', () => {
    // Initialising at 0 is the point — initialising from the current prop hides the transition from the engine.
    expect(stage).toMatch(/useState\(0\)/);
    // Raising it in the same frame is swallowed by mount again, so it is deferred one tick.
    expect(stage).toMatch(/requestAnimationFrame\(/);
    expect(stage).toMatch(/setRevealToken\(1\)/);
  });

  it('엔진 쪽 안무는 여전히 살아 있다', () => {
    const loop = codeOnly(read('src/widgets/topology-map-v2/ui/use-topology-loop.ts'));
    // The contract above assumes the comparison baseline starts at 0.
    expect(loop).toMatch(/lastRevealTokenRef = useRef\(0\)/);
    // The origin is the project node's home — the radial spring's natural arc prevents a straight-line flight.
    expect(loop).toMatch(/homingActiveRef\.current = true/);
  });
});
