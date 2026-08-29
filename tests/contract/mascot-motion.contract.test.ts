import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOTION_ROWS } from '../../scripts/build-brand-assets.mjs';
import { MASCOT_WALK_MS } from '../../src/features/agent-activity/ui/AgentMascotPresence';

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
const PRESENCE = readFileSync(
  path.join(ROOT, 'src/features/agent-activity/ui/AgentMascotPresence.tsx'),
  'utf8',
);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Minimal decoder for the authored 8-bit RGBA, non-interlaced PNG contract. */
function decodeRgbaPng(file: string): { width: number; height: number; pixels: Buffer } {
  const png = readFileSync(path.join(ROOT, file));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24], `${file} must stay 8-bit`).toBe(8);
  expect(png[25], `${file} must stay RGBA`).toBe(6);
  expect(png[28], `${file} must stay non-interlaced`).toBe(0);

  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[sourceOffset + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor =
        filter === 0 ? 0 :
          filter === 1 ? left :
            filter === 2 ? up :
              filter === 3 ? Math.floor((left + up) / 2) :
                filter === 4 ? paeth(left, up, upperLeft) : Number.NaN;
      expect(Number.isNaN(predictor), `${file} uses unsupported PNG filter ${filter}`).toBe(false);
      pixels[y * stride + x] = (encoded + predictor) & 0xff;
    }
    sourceOffset += stride;
  }
  return { width, height, pixels };
}

function frame(row: ReturnType<typeof decodeRgbaPng>, index: number): Buffer {
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    const sourceStart = (y * row.width + index * 64) * 4;
    row.pixels.copy(out, y * 64 * 4, sourceStart, sourceStart + 64 * 4);
  }
  return out;
}

describe('mascot motion continuity', () => {
  const rows = Object.fromEntries(
    Object.entries(MASCOT_MOTION_ROWS).map(([state, spec]) => [state, decodeRgbaPng(spec.path)]),
  ) as Record<keyof typeof MASCOT_MOTION_ROWS, ReturnType<typeof decodeRgbaPng>>;

  it('uses one five-transition clock for six poses and a 64px right-edge stage', () => {
    const fastMs = Number(CSS.match(/--motion-fast:\s*(\d+)ms/)?.[1]);
    expect(fastMs).toBe(120);
    expect(MASCOT_WALK_MS).toBe(fastMs * 5);
    expect(CSS).toMatch(
      /--atlas-mascot-sequence-duration:\s*calc\(var\(--motion-fast\) \* 5\)/,
    );
    expect(CSS.match(/var\(--atlas-mascot-sequence-duration\) steps\(5, end\)/g)).toHaveLength(2);
    expect(PRESENCE).toContain(
      'right-[var(--chrome-inset)] top-[calc(50%+var(--chrome-inset)*2)]',
    );
    expect(PRESENCE).toContain('hidden size-16 overflow-visible lg:block');
    expect(PRESENCE).not.toContain('w-32');
  });

  it('joins WALK to READ and READ to SUCCESS with identical boundary pixels', () => {
    expect(frame(rows.walk, 5)).toEqual(frame(rows.read, 0));
    expect(frame(rows.success, 0)).toEqual(frame(rows.read, 5));
    expect(frame(rows.success, 1)).not.toEqual(frame(rows.success, 0));
  });

  it('keeps every opaque frame pixel inside the existing right-side map reserve', () => {
    const chromeInset = Number(CSS.match(/--chrome-inset:\s*(\d+)px/)?.[1]);
    const safeRight = Number(CSS.match(/--topology-v2-safe-inset-right:\s*(\d+)/)?.[1]);
    expect({ chromeInset, safeRight }).toEqual({
      chromeInset: 24,
      safeRight: 120,
    });

    const leaks: string[] = [];
    for (const [state, row] of Object.entries(rows)) {
      for (let index = 0; index < 6; index += 1) {
        const pixels = frame(row, index);
        for (let y = 0; y < 64; y += 1) {
          for (let x = 0; x < 64; x += 1) {
            if (pixels[(y * 64 + x) * 4 + 3] === 0) continue;
            const fromRight = chromeInset + (64 - x);
            if (fromRight > safeRight) {
              leaks.push(`${state}:${index + 1}@${x},${y}`);
            }
          }
        }
      }
    }
    expect(leaks, 'opaque mascot ink escaped the topology map right-side reserve').toEqual([]);
  });
});
