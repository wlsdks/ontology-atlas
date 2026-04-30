import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './defaults';
import { hasRegisteredCategoryRegions } from './presence';
import type { Category } from './types';

function toCategory(category: (typeof DEFAULT_CATEGORIES)[number]): Category {
  return {
    ...category,
    createdAt: new Date('2026-04-18T00:00:00Z'),
    updatedAt: new Date('2026-04-18T00:00:00Z'),
  };
}

describe('hasRegisteredCategoryRegions', () => {
  it('returns false when categories match the seeded defaults', () => {
    const categories = DEFAULT_CATEGORIES.map(toCategory);

    expect(hasRegisteredCategoryRegions(categories)).toBe(false);
  });

  it('returns true when any default category geometry changes', () => {
    const categories = DEFAULT_CATEGORIES.map((category) =>
      toCategory(
        category.id === 'planned'
          ? {
              ...category,
              size: { ...category.size, width: category.size.width + 120 },
            }
          : category,
      ),
    );

    expect(hasRegisteredCategoryRegions(categories)).toBe(true);
  });

  it('returns true when an extra category is registered', () => {
    const categories = [
      ...DEFAULT_CATEGORIES.map(toCategory),
      {
        id: 'knowledge',
        label: '지식',
        labelEn: 'Knowledge',
        order: 2,
        position: { x: 1600, y: 120 },
        size: { width: 920, height: 920 },
        radius: 320,
        borderStyle: 'solid' as const,
        createdAt: new Date('2026-04-18T00:00:00Z'),
        updatedAt: new Date('2026-04-18T00:00:00Z'),
      },
    ];

    expect(hasRegisteredCategoryRegions(categories)).toBe(true);
  });
});
