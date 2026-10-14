import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

/**
 * An empty state ends in one door, pinned by test id and destination rather than prose, so rewording
 * stays free while deleting the door does not. One entry per empty state; a second competing action
 * would be the opposite defect.
 */
const DOORS: ReadonlyArray<{
  readonly what: string;
  readonly file: string;
  readonly testId: string;
  readonly href: string;
}> = [
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
    // Both are locale-prefixed App Router segments; a door pointing at a retired namespace would be
    // worse than none.
    const destinations = new Set(DOORS.map((door) => door.href.split('?')[0]));
    expect([...destinations].sort()).toEqual(['/projects/', '/topology/']);
    for (const segment of ['topology', 'projects']) {
      expect(() => read(`app/[locale]/${segment}/page.tsx`)).not.toThrow();
    }
  });
});
