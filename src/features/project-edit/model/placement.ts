import type { Category } from '@/entities/category';
import type { Project, ProjectPosition } from '@/entities/project';

export const PROJECT_CARD_WIDTH = 220;
export const PROJECT_CARD_HEIGHT = 140;

export type ProjectPositionUpdate = {
  slug: string;
  position: ProjectPosition;
};

const CATEGORY_PADDING = 48;
const GRID_GAP_X = 28;
const GRID_GAP_Y = 24;
const OVERLAP_PADDING = 16;

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function toRect(position: ProjectPosition): Rect {
  return {
    left: position.x,
    top: position.y,
    right: position.x + PROJECT_CARD_WIDTH,
    bottom: position.y + PROJECT_CARD_HEIGHT,
  };
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
  };
}

function overlaps(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function isProjectPositionInsideCategory(
  category: Category | undefined,
  position: ProjectPosition,
) {
  if (!category) {
    return false;
  }

  const minX = category.position.x - category.size.width / 2;
  const maxX = category.position.x + category.size.width / 2;
  const minY = category.position.y - category.size.height / 2;
  const maxY = category.position.y + category.size.height / 2;

  return (
    position.x >= minX &&
    position.y >= minY &&
    position.x + PROJECT_CARD_WIDTH <= maxX &&
    position.y + PROJECT_CARD_HEIGHT <= maxY
  );
}

function buildCandidatePositions(category: Category): ProjectPosition[] {
  const minX = Math.round(category.position.x - category.size.width / 2 + CATEGORY_PADDING);
  const maxX = Math.round(category.position.x + category.size.width / 2 - CATEGORY_PADDING - PROJECT_CARD_WIDTH);
  const minY = Math.round(category.position.y - category.size.height / 2 + CATEGORY_PADDING);
  const maxY = Math.round(category.position.y + category.size.height / 2 - CATEGORY_PADDING - PROJECT_CARD_HEIGHT);

  if (maxX < minX || maxY < minY) {
    return [
      {
        x: Math.round(category.position.x - PROJECT_CARD_WIDTH / 2),
        y: Math.round(category.position.y - PROJECT_CARD_HEIGHT / 2),
      },
    ];
  }

  const candidates: ProjectPosition[] = [];
  for (let y = minY; y <= maxY; y += PROJECT_CARD_HEIGHT + GRID_GAP_Y) {
    for (let x = minX; x <= maxX; x += PROJECT_CARD_WIDTH + GRID_GAP_X) {
      candidates.push({ x, y });
    }
  }

  return candidates.sort((a, b) => {
    const centerAX = a.x + PROJECT_CARD_WIDTH / 2;
    const centerAY = a.y + PROJECT_CARD_HEIGHT / 2;
    const centerBX = b.x + PROJECT_CARD_WIDTH / 2;
    const centerBY = b.y + PROJECT_CARD_HEIGHT / 2;
    const distanceA = Math.hypot(centerAX - category.position.x, centerAY - category.position.y);
    const distanceB = Math.hypot(centerBX - category.position.x, centerBY - category.position.y);
    return distanceA - distanceB;
  });
}

export function findProjectPlacement(category: Category | undefined, projects: Project[]): ProjectPosition {
  if (!category) {
    return { x: -110, y: -70 };
  }

  const occupied = projects
    .filter((project) => project.category === category.id)
    // R15 — position undefined 인 project (vault 가 명시 안 함) 는 placement
    // 에서 제외 (좌표 없으니 overlap 계산 불가).
    .filter((project) => project.position !== undefined)
    .map((project) => expandRect(toRect(project.position!), OVERLAP_PADDING));

  for (const candidate of buildCandidatePositions(category)) {
    const rect = toRect(candidate);
    if (occupied.every((existing) => !overlaps(rect, existing))) {
      return candidate;
    }
  }

  return {
    x: Math.round(category.position.x - PROJECT_CARD_WIDTH / 2),
    y: Math.round(category.position.y - PROJECT_CARD_HEIGHT / 2),
  };
}

export function buildOutOfBoundsRepairUpdates(
  projects: Project[],
  categories: Category[],
): ProjectPositionUpdate[] {
  const updates: ProjectPositionUpdate[] = [];
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  for (const category of [...categories].sort((a, b) => a.order - b.order)) {
    const categoryProjects = projects.filter((project) => project.category === category.id);
    // R15 — position 없는 project 는 inside 판단 불가 → misplaced 로 취급
    // (placement 강제 적용).
    const placedProjects = categoryProjects.filter(
      (project) =>
        project.position !== undefined &&
        isProjectPositionInsideCategory(category, project.position),
    );
    const misplacedProjects = categoryProjects
      .filter(
        (project) =>
          project.position === undefined ||
          !isProjectPositionInsideCategory(category, project.position),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    for (const project of misplacedProjects) {
      const targetCategory = project.category
        ? categoryMap.get(project.category)
        : undefined;
      if (!targetCategory) continue;

      const position = findProjectPlacement(targetCategory, placedProjects);
      updates.push({
        slug: project.slug,
        position,
      });
      placedProjects.push({
        ...project,
        position,
      });
    }
  }

  return updates;
}
