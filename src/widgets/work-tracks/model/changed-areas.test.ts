import { describe, expect, it } from 'vitest';
import { changedAreas } from './changed-areas';

describe('changedAreas', () => {
  it('counts files under their folder cut to three names, and root files under the root', () => {
    const areas = changedAreas([
      { path: 'src/widgets/work-tracks/ui/LargeRoom.tsx', changedAt: 50 },
      { path: 'src/widgets/work-tracks/model/room-look.ts', changedAt: 40 },
      { path: 'docs/features/work-status.md', changedAt: 30 },
      { path: 'package.json', changedAt: 20 },
    ]);
    expect(areas).toEqual([
      { path: 'src/widgets/work-tracks', files: 2, changedAt: 50 },
      { path: 'docs/features', files: 1, changedAt: 30 },
      { path: '', files: 1, changedAt: 20 },
    ]);
  });

  it('puts the folder written last first, whatever the order of its files, and breaks a tie by count', () => {
    const areas = changedAreas([
      { path: 'a/one.ts', changedAt: 10 },
      { path: 'b/one.ts', changedAt: 10 },
      { path: 'b/two.ts', changedAt: 5 },
      { path: 'c/one.ts', changedAt: null },
      { path: 'a/two.ts', changedAt: 90 },
    ]);
    expect(areas.map(area => area.path)).toEqual(['a', 'b', 'c']);
    expect(areas[0]).toMatchObject({ files: 2, changedAt: 90 });
    expect(areas[2].changedAt).toBeNull();
  });

  it('returns no area for no files', () => {
    expect(changedAreas([])).toEqual([]);
  });
});
