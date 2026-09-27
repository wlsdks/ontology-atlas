import type { Category } from "./types";

/** Seed categories; ids stay byte-compatible, or projects referencing them are orphaned. */
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
