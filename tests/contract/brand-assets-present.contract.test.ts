import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MASCOT_MOTION_ROWS } from '../../scripts/build-brand-assets.mjs';

const ROOT = join(import.meta.dirname, '../..');
const readText = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(join(ROOT, path));
  expect(buffer.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function pngFiles(root: string): string[] {
  const absolute = join(ROOT, root);
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.png')) out.push(relative(ROOT, path));
    }
  };
  visit(absolute);
  return out.sort();
}

describe('pixel mascot brand outputs', () => {
  it('retires every nested-hex SVG identity file', () => {
    for (const path of [
      'app/icon.svg',
      'public/brand-mark.svg',
      'public/brand/mark.svg',
      'public/brand/mark-mono.svg',
      'public/brand/icon-mono-light.svg',
      'public/brand/icon-mono-dark.svg',
      'public/brand/lockup.svg',
      'public/brand/lockup-light.svg',
      'public/brand/lockup-dark.svg',
      'public/brand/lockup-compact.svg',
    ]) {
      expect(existsSync(join(ROOT, path)), `${path} still carries the retired mark`).toBe(false);
    }
  });

  it('ships the raster marks and lockups consumed by the app and README', () => {
    const expected: Record<string, { width: number; height: number }> = {
      'app/icon.png': { width: 32, height: 32 },
      'public/brand/mascot-full.png': { width: 512, height: 512 },
      'public/brand/mascot-compact.png': { width: 64, height: 64 },
      'public/brand/mascot-micro.png': { width: 16, height: 16 },
      'public/brand/lockup.png': { width: 520, height: 96 },
      'public/brand/lockup@2x.png': { width: 1040, height: 192 },
      'public/brand/lockup-light@2x.png': { width: 1040, height: 192 },
      'public/brand/lockup-dark@2x.png': { width: 1040, height: 192 },
      'public/brand/lockup-compact.png': { width: 460, height: 96 },
    };
    for (const [path, dimensions] of Object.entries(expected)) {
      expect(existsSync(join(ROOT, path)), `${path} is missing`).toBe(true);
      expect(pngSize(path)).toEqual(dimensions);
    }
  });

  it('installs the exact motion rows without another raster copy drifting', () => {
    for (const [state, spec] of Object.entries(MASCOT_MOTION_ROWS)) {
      const installed = `public/brand/mascot-${state}-row.png`;
      expect(readFileSync(join(ROOT, installed))).toEqual(readFileSync(join(ROOT, spec.path)));
    }
  });

  it('installs the exact 2x macOS template into the native bundle tree', () => {
    expect(readFileSync(join(ROOT, 'src-tauri/icons/tray-template.png'))).toEqual(
      readFileSync(join(ROOT, 'assets/brand/mascot/mascot-tray-template-32.png')),
    );
  });

  it('keeps Open Graph and PWA declarations equal to their files', () => {
    const layout = readText('app/layout.tsx');
    const width = Number(layout.match(/url: '\/og-image\.png',\s*\n\s*width: (\d+)/)![1]);
    const height = Number(layout.match(/url: '\/og-image\.png',[\s\S]{0,80}?height: (\d+)/)![1]);
    expect(pngSize('public/og-image.png')).toEqual({ width, height });

    const manifest = JSON.parse(readText('public/manifest.webmanifest')) as {
      icons: { src: string; sizes: string }[];
    };
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(`public${icon.src}`)).toEqual({ width: w, height: h });
    }
  });

  it('every committed Tauri PNG is owned by the installation plan', () => {
    const plan = readText('scripts/install-brand-icons.mjs');
    const orphans = pngFiles('src-tauri/icons').filter((path) => !plan.includes(`'${path}'`));
    expect(orphans, 'an unplanned platform icon will keep the retired brand').toEqual([]);
  });
});
