import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOTION_ROWS } from '../../scripts/build-brand-assets.mjs';
import { MASCOT_WALK_MS } from '../../src/features/agent-activity/ui/AgentMascotPresence';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

const ROOT = process.cwd();
const CSS = readGlobalCss();

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

  it('uses one five-transition clock for six poses', () => {
    const fastMs = Number(CSS.match(/--motion-fast:\s*(\d+)ms/)?.[1]);
    expect(fastMs).toBe(120);
    expect(MASCOT_WALK_MS).toBe(fastMs * 5);
    expect(CSS).toMatch(
      /--atlas-mascot-sequence-duration:\s*calc\(var\(--motion-fast\) \* 5\)/,
    );
    expect(CSS.match(/var\(--atlas-mascot-sequence-duration\) steps\(5, end\)/g)).toHaveLength(1);
    expect(Object.keys(rows).length).toBeGreaterThan(0);
    for (const row of Object.values(rows)) {
      expect({ width: row.width, height: row.height }).toEqual({ width: 384, height: 64 });
    }
  });

  it('joins WALK to READ and READ to SUCCESS with identical boundary pixels', () => {
    expect(frame(rows.walk, 5)).toEqual(frame(rows.read, 0));
    expect(frame(rows.success, 0)).toEqual(frame(rows.read, 5));
    expect(frame(rows.success, 1)).not.toEqual(frame(rows.success, 0));
  });

});
