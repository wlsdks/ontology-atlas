import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

/**
 * An empty state ends in one door.
 *
 * The 2026-09-05 audit counted 24 empty states rendering explanatory prose with
 * no control at all. The repeating shape was not oversight in the abstract: on
 * `/ontology/insights` and on the project detail, a sibling empty state on the
 * very same page already solved the identical problem with one navigating link,
 * and the copied variant lost it. Each row below is one of those copies, now
 * carrying the sibling's door.
 *
 * Pinned by test id and destination rather than by prose, so rewording stays
 * free while deleting the door does not. One entry per empty state — a second
 * competing action would be the opposite defect and is not what these fix.
 */
const DOORS: ReadonlyArray<{
  readonly what: string;
  readonly file: string;
  readonly testId: string;
  readonly href: string;
}> = [
  {
    what: 'insights connections — relation types',
    file: 'src/views/ontology-insights/ui/tabs/ConnectionsTab.tsx',
    testId: 'connections-relation-types-empty-action',
    href: '/topology/?workbench=create',
  },
  {
    what: 'insights connections — hubs',
    file: 'src/views/ontology-insights/ui/tabs/ConnectionsTab.tsx',
    testId: 'connections-hubs-empty-action',
    href: '/topology/?workbench=create',
  },
  {
    what: 'insights connections — impact ranking',
    file: 'src/views/ontology-insights/ui/tabs/ImpactRankingCard.tsx',
    testId: 'impact-ranking-empty-action',
    href: '/topology/?workbench=create',
  },
  {
    what: 'insights freshness — no domains',
    file: 'src/views/ontology-insights/ui/tabs/FreshnessTab.tsx',
    testId: 'freshness-no-domains-action',
    href: '/topology/?workbench=create',
  },
  {
    what: 'project detail — composition',
    file: 'src/views/project-detail/ui/ProjectDetailPage.tsx',
    testId: 'project-detail-composition-empty-action',
    href: '/topology/?workbench=create',
  },
  {
    what: 'project detail — connected projects',
    file: 'src/views/project-detail/ui/ProjectDetailPage.tsx',
    testId: 'project-detail-connected-empty-action',
    href: '/projects/',
  },
];

describe('an empty state ends in one door', () => {
  for (const { what, file, testId, href } of DOORS) {
    it(`${what} offers a way to the screen that unblocks it`, () => {
      const source = read(file);
      // The id may be written on the element or handed to a small shared
      // action component; either way it must be the id the door renders with.
      expect(source).toContain(`"${testId}"`);
      expect(source).toContain(`href="${href}"`);
    });
  }

  it('each door is a real route, not an invented one', () => {
    // `/topology` and `/projects` both exist as locale-prefixed App Router
    // segments; a door pointing at a retired namespace would be worse than no
    // door at all.
    const destinations = new Set(DOORS.map((door) => door.href.split('?')[0]));
    expect([...destinations].sort()).toEqual(['/projects/', '/topology/']);
    for (const segment of ['topology', 'projects']) {
      expect(() => read(`app/[locale]/${segment}/page.tsx`)).not.toThrow();
    }
  });
});
