import { describe, expect, it } from 'vitest';
import { firstPlanningDocument, groupPlanningFiles } from './file-groups';

describe('groupPlanningFiles', () => {
  it('puts the folder root first and keeps folders in scan order', () => {
    expect(groupPlanningFiles(['plans/a.md', 'research/b.md', 'roadmap.md', 'plans/c.md', 'images/d.png'])).toEqual([
      { folder: '', paths: ['roadmap.md'] },
      { folder: 'plans', paths: ['plans/a.md', 'plans/c.md'] },
      { folder: 'research', paths: ['research/b.md'] },
      { folder: 'images', paths: ['images/d.png'] },
    ]);
  });

  it('keeps nested folders apart from their parent', () => {
    expect(groupPlanningFiles(['alpha/checkout.md', 'alpha/deep/checkout.md']).map((group) => group.folder)).toEqual(['alpha', 'alpha/deep']);
  });
});

describe('firstPlanningDocument', () => {
  it('opens the first Markdown file in shown order and skips images', () => {
    expect(firstPlanningDocument(['images/a.png', 'plans/b.MD', 'c.md'])).toBe('c.md');
    expect(firstPlanningDocument(['images/a.png', 'plans/b.MD'])).toBe('plans/b.MD');
  });

  it('opens nothing in a folder of images', () => {
    expect(firstPlanningDocument(['a.png'])).toBeNull();
  });
});
