import { describe, expect, it } from 'vitest';
import source from './moru-companion.json';
import { companionMotion } from './moru-companion-motion';

const x = (frame: Keyframe) => Number(String(frame.transform).match(/translateX\((-?[\d.]+)px\)/)?.[1]);
function cellAt(frame: Keyframe) {
  const match = String(frame.transform).match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!;
  return -Number(match[2]) / source.cell * source.columns - Number(match[1]) / source.cell;
}
function positionAt(frames: Keyframe[], offset: number) {
  const end = frames.findIndex(frame => Number(frame.offset) > offset);
  if (end < 0) return x(frames.at(-1)!);
  const a = frames[Math.max(0, end - 1)], b = frames[end];
  const part = (offset - Number(a.offset)) / (Number(b.offset) - Number(a.offset));
  return x(a) + (x(b) - x(a)) * part;
}

describe('Moru ground contact', () => {
  it('keeps pending work at rest and reserves the folder prop for selection', () => {
    const waiting = companionMotion(640, 'waiting');
    expect(waiting.movement.every(frame => x(frame) === 0)).toBe(true);
    expect(waiting.emote.every(frame => Number(frame.opacity) === 0)).toBe(true);
    for (const context of ['folder', 'welcome'] as const) {
      const active = companionMotion(32, context);
      const visible = active.emote.filter(frame => Number(frame.opacity) > 0);
      expect(visible.length).toBeGreaterThan(0);
      // The ornament accompanies travel, never the stationary folder invitation.
      expect(visible.every(frame => active.restAt(Number(frame.offset) * active.duration).delay > 0)).toBe(true);
      expect(active.emote.at(-1)?.opacity).toBe(0);
    }
    const isFolder = (frame: Keyframe) => ['folder-open', 'folder-peek'].some(id => {
      const clip = source.clips[id as 'folder-open' | 'folder-peek'];
      return cellAt(frame) >= clip.firstFrame && cellAt(frame) < clip.firstFrame + clip.durationsMs.length;
    });
    expect(companionMotion(640, 'welcome').sprite.some(isFolder)).toBe(false);
    expect(companionMotion(640, 'folder').sprite.some(isFolder)).toBe(true);
  });
  it('keeps planted poses still and moves only while the authored feet are clear of the floor', async () => {
    const require = createRequire(import.meta.url);
    const sharp = createRequire(require.resolve('next/package.json'))('sharp');
    const pixels: Buffer = await sharp('public/brand/moru-companion.png').ensureAlpha().raw().toBuffer();
    const bottomAt = (cell: number) => {
      for (let y = source.cell - 1; y >= 0; y--) for (let x = 0; x < source.cell; x++) {
        const sheetY = Math.floor(cell / source.columns) * source.cell + y;
        const sheetX = cell % source.columns * source.cell + x;
        if (pixels[(sheetY * source.cell * source.columns + sheetX) * 4 + 3]) return y + 1;
      }
      throw new Error(`Empty source cell ${cell}`);
    };
    const floor = bottomAt(source.clips.hop.firstFrame);
    const motion = companionMotion(640);
    for (let i = 0; i < motion.sprite.length - 1; i++) {
      const pose = cellAt(motion.sprite[i]);
      const hopFrame = pose - source.clips.hop.firstFrame;
      // The authored feet vary by up to three native pixels while resting. Read the
      // artwork instead of copying the implementation's lift-off/landing indices.
      const airborne = hopFrame >= 0 && hopFrame < source.clips.hop.durationsMs.length && bottomAt(pose) < floor - 3;
      if (airborne) continue;
      const from = positionAt(motion.movement, Number(motion.sprite[i].offset));
      const to = positionAt(motion.movement, Number(motion.sprite[i + 1].offset));
      expect(to, `planted sprite cell ${pose} skated across the floor`).toBeCloseTo(from, 6);
    }
  });

  it.each([0, 12, 640, 1600])('keeps hops small and returns to its starting place in %spx of space', travel => {
    const motion = companionMotion(travel);
    const positions = motion.movement.map(x);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...positions)).toBeLessThanOrEqual(Math.min(travel, source.cell / 2));
    if (travel > 0) expect(Math.max(...positions)).toBeGreaterThan(0);
    expect(positions.at(-1)).toBe(positions[0]);
  });
});
// @vitest-environment node
import { createRequire } from 'node:module';
