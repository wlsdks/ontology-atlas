import { describe, expect, it } from "vitest";
import type { Category } from "@/entities/category";
import type { Project } from "../../../entities/project/model/types";
import {
  buildBulkCategoryUpdateInputs,
  buildBulkStatusUpdateInputs,
} from "./bulk-update";
import { PROJECT_CARD_HEIGHT, PROJECT_CARD_WIDTH } from "./placement";

const categories: Category[] = [
  {
    id: "planned",
    label: "예정",
    labelEn: "Planned",
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 1200, height: 900 },
    radius: 320,
    borderStyle: "dashed",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  },
  {
    id: "consulting",
    label: "컨설팅",
    labelEn: "Consulting",
    order: 1,
    position: { x: 1800, y: 0 },
    size: { width: 1200, height: 900 },
    radius: 320,
    borderStyle: "sideLabel",
    sideLabelText: "Consulting",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  },
];

const projects: Project[] = [
  {
    slug: "alpha",
    name: "Alpha",
    category: "planned",
    status: "idea",
    description: "desc",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 40, y: 40 },
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  },
  {
    slug: "beta",
    name: "Beta",
    category: "planned",
    status: "idea",
    description: "desc",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 320, y: 40 },
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  },
  {
    slug: "gamma",
    name: "Gamma",
    category: "consulting",
    status: "live",
    description: "desc",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 1540, y: 40 },
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  },
];

describe("buildBulkStatusUpdateInputs", () => {
  it("updates only targeted projects whose status actually changes", () => {
    const inputs = buildBulkStatusUpdateInputs({
      projects,
      targetSlugs: ["alpha", "gamma"],
      nextStatusId: "live",
    });

    expect(inputs).toHaveLength(1);
    expect(inputs[0].slug).toBe("alpha");
    expect(inputs[0].status).toBe("live");
  });
});

describe("buildBulkCategoryUpdateInputs", () => {
  it("repositions moved projects inside the target category without overlap", () => {
    const inputs = buildBulkCategoryUpdateInputs({
      projects,
      targetSlugs: ["alpha", "beta"],
      nextCategoryId: "consulting",
      categories,
    });

    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.category === "consulting")).toBe(true);

    const [first, second] = inputs;
    expect(first.position.x).toBeGreaterThanOrEqual(1200);
    expect(first.position.x + PROJECT_CARD_WIDTH).toBeLessThanOrEqual(2400);
    expect(first.position.y).toBeGreaterThanOrEqual(-450);
    expect(first.position.y + PROJECT_CARD_HEIGHT).toBeLessThanOrEqual(450);
    const overlaps =
      first.position.x < second.position.x + PROJECT_CARD_WIDTH &&
      first.position.x + PROJECT_CARD_WIDTH > second.position.x &&
      first.position.y < second.position.y + PROJECT_CARD_HEIGHT &&
      first.position.y + PROJECT_CARD_HEIGHT > second.position.y;
    expect(overlaps).toBe(false);
  });

  it("throws when the target category does not exist", () => {
    expect(() =>
      buildBulkCategoryUpdateInputs({
        projects,
        targetSlugs: ["alpha"],
        nextCategoryId: "missing",
        categories,
      }),
    ).toThrowError("대상 카테고리를 찾지 못했습니다.");
  });
});
