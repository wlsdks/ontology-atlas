import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MASCOT_PALETTE } from '../../scripts/build-brand-assets.mjs';

const ROOT = process.cwd();
const APP_SOURCE_ROOTS = ['app', 'src'] as const;

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:css|ts|tsx|js|jsx)$/.test(entry.name)) out.push(absolute);
    }
  };
  visit(path.join(ROOT, root));
  return out;
}

export function mascotPaletteLeaks(
  files: ReadonlyArray<{ path: string; source: string }>,
): string[] {
  const literals = Object.values(MASCOT_PALETTE).map((value) => value.toLowerCase());
  return files.flatMap(({ path: file, source }) => {
    const lower = source.toLowerCase();
    return literals
      .filter((literal) => lower.includes(literal))
      .map((literal) => `${file}: ${literal}`);
  });
}

describe('mascot palette boundary', () => {
  it('keeps mascot colours out of application CSS and TypeScript', () => {
    const files = APP_SOURCE_ROOTS.flatMap(sourceFiles).map((absolute) => ({
      path: path.relative(ROOT, absolute),
      source: readFileSync(absolute, 'utf8'),
    }));
    expect(
      mascotPaletteLeaks(files),
      'Mascot chartreuse/ivory/gray is identity raster ink, never a UI token, status, control, or data colour.',
    ).toEqual([]);
  });

  it('probe distinguishes an invalid CSS token from a valid raster-source declaration', () => {
    expect(
      mascotPaletteLeaks([
        { path: 'app/globals.css', source: ':root { --color-mascot: #C6F000; }' },
      ]),
    ).toEqual(['app/globals.css: #c6f000']);
    expect(
      mascotPaletteLeaks([
        { path: 'scripts/build-brand-assets.mjs', source: "signal: '#C6F000'" },
      ].filter(({ path: file }) => APP_SOURCE_ROOTS.some((root) => file.startsWith(`${root}/`)))),
    ).toEqual([]);
  });
});
