import { describe, expect, it } from 'vitest';
import type { Category } from '@/entities/category';
import type { Project } from '@/entities/project';
import {
  buildOutOfBoundsRepairUpdates,
  findProjectPlacement,
  isProjectPositionInsideCategory,
  PROJECT_CARD_HEIGHT,
  PROJECT_CARD_WIDTH,
} from './placement';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'planned',
    label: '예정',
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 1200, height: 900 },
    radius: 320,
    borderStyle: 'solid',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function project(slug: string, position: { x: number; y: number }, categoryId = 'planned'): Project {
  return {
    slug,
    name: slug,
    category: categoryId,
    status: 'idea',
    description: '',
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('findProjectPlacement', () => {
  it('returns a position inside the category bounds', () => {
    const next = findProjectPlacement(category(), []);

    expect(next.x).toBeGreaterThanOrEqual(-600);
    expect(next.y).toBeGreaterThanOrEqual(-450);
    expect(next.x + PROJECT_CARD_WIDTH).toBeLessThanOrEqual(600);
    expect(next.y + PROJECT_CARD_HEIGHT).toBeLessThanOrEqual(450);
  });

  it('finds a different slot when the first one is occupied', () => {
    const planned = category();
    const first = findProjectPlacement(planned, []);
    const second = findProjectPlacement(planned, [project('first', first)]);

    expect(second).not.toEqual(first);
  });

  it('ignores projects from other categories', () => {
    const planned = category();
    const next = findProjectPlacement(planned, [project('consulting-project', { x: -110, y: -70 }, 'consulting')]);

    expect(next).toEqual(findProjectPlacement(planned, []));
  });

  it('detects whether a project card is fully inside a category', () => {
    const planned = category();

    expect(isProjectPositionInsideCategory(planned, { x: -110, y: -70 })).toBe(true);
    expect(isProjectPositionInsideCategory(planned, { x: 500, y: 400 })).toBe(false);
  });

  it('builds repair updates only for projects outside their category bounds', () => {
    const planned = category();
    const consulting = category({
      id: 'consulting',
      label: '컨설팅',
      order: 1,
      position: { x: 1600, y: 0 },
    });

    const updates = buildOutOfBoundsRepairUpdates(
      [
        project('inside-planned', { x: -110, y: -70 }, 'planned'),
        project('outside-planned', { x: 2400, y: 1200 }, 'planned'),
        project('inside-consulting', { x: 1490, y: -70 }, 'consulting'),
      ],
      [planned, consulting],
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]?.slug).toBe('outside-planned');
    expect(isProjectPositionInsideCategory(planned, updates[0]!.position)).toBe(true);
    expect(updates[0]!.position).not.toEqual({ x: 2400, y: 1200 });
  });

  it('assigns distinct repair slots when multiple projects are outside the same category', () => {
    const planned = category();
    const updates = buildOutOfBoundsRepairUpdates(
      [
        project('outside-a', { x: 2400, y: 1200 }, 'planned'),
        project('outside-b', { x: 2600, y: 1400 }, 'planned'),
      ],
      [planned],
    );

    expect(updates).toHaveLength(2);
    expect(updates[0]!.position).not.toEqual(updates[1]!.position);
    expect(isProjectPositionInsideCategory(planned, updates[0]!.position)).toBe(true);
    expect(isProjectPositionInsideCategory(planned, updates[1]!.position)).toBe(true);
  });
});
