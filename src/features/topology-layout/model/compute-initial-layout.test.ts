import { describe, it, expect } from 'vitest';
import { computeInitialLayout } from './compute-initial-layout';
import type { Project } from '@/entities/project';
import type { Category } from '@/entities/category';

function makeCategory(id: string, x: number, y: number): Category {
  return {
    id,
    label: id,
    labelEn: id,
    order: 0,
    position: { x, y },
    size: { width: 2000, height: 1200 },
    radius: 800,
    borderStyle: 'solid',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function makeProject(
  slug: string,
  category: string,
  position: { x: number; y: number },
  isHub = false,
  dependencies: string[] = [],
): Project {
  return {
    slug,
    name: slug,
    category,
    status: 'live',
    description: '',
    tags: [],
    stack: [],
    links: [],
    dependencies,
    screenshots: [],
    timeline: {},
    isHub,
    position,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('computeInitialLayout', () => {
  it('admin이 지정한 명시적 좌표는 sim이 건드리지 않는다', () => {
    const categoryMap = new Map<string, Category>([
      ['in-progress', makeCategory('in-progress', 0, 0)],
    ]);
    const pinnedPosition = { x: 123, y: -456 };
    const projects = [
      makeProject('pinned', 'in-progress', pinnedPosition),
      makeProject('free-1', 'in-progress', { x: 0, y: 0 }),
      makeProject('free-2', 'in-progress', { x: 0, y: 0 }),
    ];

    const layout = computeInitialLayout(projects, categoryMap);
    const pinned = layout.get('pinned');
    expect(pinned).toBeDefined();
    // fx/fy로 고정돼있어 sim 700 tick 후에도 그대로.
    expect(pinned!.x).toBeCloseTo(pinnedPosition.x, 1);
    expect(pinned!.y).toBeCloseTo(pinnedPosition.y, 1);
  });

  it('명시 좌표가 없는 노드(= (0,0))는 cluster 중심 부근으로 배치된다', () => {
    const categoryMap = new Map<string, Category>([
      ['planned', makeCategory('planned', 2000, 1000)],
    ]);
    const projects = [
      makeProject('a', 'planned', { x: 0, y: 0 }),
      makeProject('b', 'planned', { x: 0, y: 0 }),
    ];

    const layout = computeInitialLayout(projects, categoryMap);
    const a = layout.get('a');
    expect(a).toBeDefined();
    // cluster 중심(2000, 1000) 기준 ±1000px 이내로 수렴해야.
    // NODE_WIDTH/HEIGHT 반영한 top-left 좌표라 정확히 중심은 아니지만 근처.
    expect(Math.abs(a!.x - 2000)).toBeLessThan(1100);
    expect(Math.abs(a!.y - 1000)).toBeLessThan(1100);
  });
});
