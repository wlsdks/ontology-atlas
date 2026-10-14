import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_SPLIT_MIN_WIDTH_REM } from '../../../src/views/download/ui/HeroObject';

/**
 * `HeroObject` reads the split width through `matchMedia`; the Tailwind `min-[Nrem]:` variants
 * in the two files must carry the same value as the constant.
 */
const root = join(import.meta.dirname, '..', '..', '..');
const files = ['src/views/download/ui/DownloadPage.tsx', 'src/views/download/ui/HeroObject.tsx'];

describe('hero split width', () => {
  it('every min-[…rem] consumer equals HERO_SPLIT_MIN_WIDTH_REM', () => {
    for (const rel of files) {
      const text = readFileSync(join(root, rel), 'utf8');
      const widths = [...text.matchAll(/min-\[(\d+)rem\]:/g)].map((m) => Number(m[1]));
      expect(widths.length, `${rel} has no split consumer`).toBeGreaterThan(0);
      for (const w of widths) expect(w, rel).toBe(HERO_SPLIT_MIN_WIDTH_REM);
    }
  });
  it('the split owns its sites — no xl: variant remains on them', () => {
    const page = readFileSync(join(root, files[0]), 'utf8');
    expect(page).not.toMatch(/xl:min-h-\[calc\(100svh/);
    expect(page).not.toMatch(/data-testid="gateway-hero-plinth"[\s\S]{0,400}xl:hidden/);
  });
});
