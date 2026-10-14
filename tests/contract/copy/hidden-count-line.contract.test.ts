import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

describe('the capped lists this round measured state their remainder', () => {
  const SITES: ReadonlyArray<readonly [string, string]> = [
    [
      'full-detail reach domain bars',
      'src/widgets/full-detail-a1/ui/full-detail-a1-reach-panel.tsx',
    ],
  ];

  for (const [group, file] of SITES) {
    it(`${group} renders HiddenCountLine`, () => {
      expect(read(file)).toContain('HiddenCountLine');
    });
  }

  it('each site still caps its rows, so the line has something to report', () => {
    expect(read('src/widgets/full-detail-a1/ui/full-detail-a1-reach-panel.tsx')).toContain(
      'DOMAIN_ROW_LIMIT',
    );
  });

  it('the primitive never grows a decorative trailing arrow', () => {
    const source = read('src/shared/ui/status/hidden-count-line.tsx');
    expect(source).not.toMatch(/[→↗]/u);
    expect(source).not.toContain('ArrowRight');
    expect(source).not.toContain('ArrowUpRight');
  });
});
