import type { Category } from "./types";

/**
 * Seed categories for an empty store. The IDs stay byte-compatible with the
 * literals older projects reference ('in-progress', 'planned') — changing one
 * orphans every project that points at it.
 */
export const DEFAULT_CATEGORIES: Category[] = [
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
