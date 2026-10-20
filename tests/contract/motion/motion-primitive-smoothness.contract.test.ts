import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");

const SPEC_OF: Record<string, string> = {
  "app/styles/motion-checkbox.css": "motion/motion-checkbox.spec.ts",
  "src/shared/motion/drawn-check.tsx": "motion/motion-checkbox.spec.ts",
  "app/styles/motion-feedback.css": "insights/insights-motion-feedback.spec.ts",
  "src/shared/motion/feedback-glyph.tsx": "insights/insights-motion-feedback.spec.ts",
  "src/shared/motion/action-feedback-glyph.tsx": "insights/insights-motion-feedback.spec.ts",
  "app/styles/motion-indicator.css": "motion/motion-selection-indicator.spec.ts",
  "src/shared/motion/use-sliding-indicator.ts": "motion/motion-selection-indicator.spec.ts",
  "app/styles/motion-morph.css": "motion/motion-shared-element.spec.ts",
  "src/shared/motion/shared-element.ts": "motion/motion-shared-element.spec.ts",
  "app/styles/motion-stagger.css": "motion/motion-stagger.spec.ts",
  "src/shared/motion/stagger.ts": "motion/motion-stagger.spec.ts",
  "app/styles/motion-surface.css": "motion/motion-surfaces.spec.ts",
  "app/styles/motion-work.css": "motion/motion-work-status.spec.ts",
  "src/shared/motion/work-glyph.tsx": "motion/motion-work-status.spec.ts",
  "src/shared/motion/work-progress.tsx": "motion/motion-work-status.spec.ts",
};

const PRIMITIVES_OUTSIDE_THE_LIBRARY = ["motion/motion-press.spec.ts", "motion/motion-disclosure.spec.ts"];

const NOT_PRIMITIVES: Record<string, string> = {
  "src/shared/motion/ease.ts": "curve math",
  "src/shared/motion/index.ts": "barrel",
  "src/shared/motion/spring.ts": "closed form, measured through its consumers' specs",
  "src/shared/motion/tokens.ts": "values",
  "src/shared/motion/use-exit-lockout.ts": "stops a leaving surface taking pointer input; it draws nothing",
};

function inventory(): string[] {
  const parts = readdirSync(path.join(ROOT, "app/styles"))
    .filter((file) => /^motion-.+\.css$/.test(file))
    .map((file) => `app/styles/${file}`);
  const modules = readdirSync(path.join(ROOT, "src/shared/motion"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => `src/shared/motion/${file}`);
  return [...parts, ...modules].sort();
}

function unmapped(subjects: readonly string[]): string[] {
  return subjects.filter((subject) => !(subject in SPEC_OF) && !(subject in NOT_PRIMITIVES));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("motion primitives: each has a spec that checks its smoothness", () => {
  it("every motion part and module is mapped to a spec or listed as not a primitive", () => {
    expect(unmapped(inventory())).toEqual([]);
  });

  it("no mapped key is dead", () => {
    const subjects = new Set(inventory());
    const dead = [...Object.keys(SPEC_OF), ...Object.keys(NOT_PRIMITIVES)].filter((key) => !subjects.has(key));
    expect(dead).toEqual([]);
  });

  it("a new motion part is reported as unmapped", () => {
    expect(unmapped([...inventory(), "app/styles/motion-glow.css"])).toEqual(["app/styles/motion-glow.css"]);
  });

  it("every spec exists and calls expectSmoothMotion", () => {
    const specs = [...new Set([...Object.values(SPEC_OF), ...PRIMITIVES_OUTSIDE_THE_LIBRARY])];
    expect(specs.length).toBeGreaterThanOrEqual(9);
    const missing = specs.filter((spec) => !existsSync(path.join(ROOT, "tests/e2e", spec)));
    expect(missing).toEqual([]);
    const unchecked = specs.filter(
      (spec) => !stripComments(readFileSync(path.join(ROOT, "tests/e2e", spec), "utf8")).includes("expectSmoothMotion("),
    );
    expect(unchecked).toEqual([]);
  });
});
