import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

/**
 * Four counted groups were measured truncating in silence (2026-09-05 audit):
 * the insights hero census relation strip, the freshness "recently updated"
 * list, the full-detail reach domain bars, and the domain-coupling example
 * edges. Each knew its true total one line away from where it cut the array.
 *
 * The behaviour (renders iff `total > shown`, always carries the difference)
 * lives in `src/shared/ui/hidden-count-line.test.tsx`. This file pins the call
 * sites by path, so deleting a remainder line from one of them turns a gate red
 * instead of quietly restoring the silence.
 */
describe('the capped lists this round measured state their remainder', () => {
  const SITES: ReadonlyArray<readonly [string, string]> = [
    [
      // Renamed on 2026-09-06: the three hero instruments became the board's four-tile census
      // strip above the tab bar. The relation strip and its remainder line moved with it.
      'insights census strip relation tile',
      'src/views/ontology-insights/ui/parts/InsightsCensusStrip.tsx',
    ],
    [
      'insights freshness recently-updated list',
      'src/views/ontology-insights/ui/tabs/FreshnessTab.tsx',
    ],
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
    expect(read('src/views/ontology-insights/ui/parts/InsightsCensusStrip.tsx')).toContain(
      'relationsShown',
    );
    expect(read('src/views/ontology-insights/lib/freshness.ts')).toContain('recentTotal');
    expect(read('src/widgets/full-detail-a1/ui/full-detail-a1-reach-panel.tsx')).toContain(
      'DOMAIN_ROW_LIMIT',
    );
  });

  it('the primitive never grows a decorative trailing arrow', () => {
    const source = read('src/shared/ui/hidden-count-line.tsx');
    expect(source).not.toMatch(/[→↗]/u);
    expect(source).not.toContain('ArrowRight');
    expect(source).not.toContain('ArrowUpRight');
  });
});
