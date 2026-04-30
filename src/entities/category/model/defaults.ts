import type { Category } from "./types";

/**
 * 기본 카테고리 — 최초 빈 DB 진입 시 seed되고, 기존 프로젝트가 참조하던
 * 리터럴 값('in-progress', 'planned')과 ID 호환된다.
 *
 * 좌표·크기는 원본 하드코딩 값 그대로 이관.
 * 원본: 이전 entities/project/model/layout.ts의 CLUSTER_* 상수.
 */
export const DEFAULT_CATEGORIES: Omit<Category, "createdAt" | "updatedAt">[] = [
  {
    id: "in-progress",
    label: "작업중",
    labelEn: "In Progress",
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 2000, height: 1600 },
    radius: 620,
    borderStyle: "underline",
  },
  {
    id: "planned",
    label: "예정",
    labelEn: "Planned",
    order: 1,
    position: { x: -1700, y: 0 },
    size: { width: 900, height: 1200 },
    radius: 360,
    borderStyle: "dashed",
  },
];
