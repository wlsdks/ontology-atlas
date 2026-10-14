import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readSkillProcedure } from "../../helpers/read-skill-procedure";

/**
 * Every component name exported by a file in the spec watch list (`PRIMITIVE_EXPORT_FILES` in
 * `design-spec-census.mjs`) must appear in the `/ui-build` signpost, so a new primitive demands its
 * name. Both host entrypoints must reach the shared procedure.
 */

const ROOT = process.cwd();

/**
 * Primitive-layer files whose routing the signpost owns: `PRIMITIVE_EXPORT_FILES` plus `button.tsx`
 * and `select.tsx`, whose value axes live in `control-class.ts` but which a screen builder must reach.
 */
const PRIMITIVE_FILES = [
  "src/shared/ui/controls/controls.tsx",
  "src/shared/ui/surfaces/surface.tsx",
  "src/shared/ui/surfaces/dialog.tsx",
  "src/shared/ui/fields/input.tsx",
  "src/shared/ui/fields/checkbox.tsx",
  "src/shared/ui/fields/segmented-control.tsx",
  "src/shared/ui/controls/button.tsx",
  "src/shared/ui/fields/select.tsx",
] as const;

const SKILL_COPIES = [
  ".claude/skills/ui-build/SKILL.md",
  ".agents/skills/ui-build/SKILL.md",
] as const;

/**
 * Counts component exports only — types (`export type`, `export interface`) and
 * value-layer constants are not things the signpost routes to.
 */
export function exportedComponents(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/gm)) {
    names.add(m[1]);
  }
  // Constants (all caps and underscores) are not primitives — e.g.
  // CHROME_STATUS_CHIP_CLASS.
  return [...names].filter((n) => !/^[A-Z0-9_]+$/.test(n)).sort();
}

describe("design-build 안내판 — 비준한 부품은 라우팅된다", () => {
  const components = PRIMITIVE_FILES.flatMap((rel) =>
    exportedComponents(readFileSync(path.join(ROOT, rel), "utf8")).map(
      (name) => [rel, name] as const,
    ),
  );

  it("탐지기가 공회전하지 않는다 — 감시 파일에서 실제로 부품을 뽑는다", () => {
    expect(components.length, "프리미티브 export 를 하나도 못 찾았다").toBeGreaterThanOrEqual(8);
    const names = components.map(([, n]) => n);
    // If these four disappear, either the files moved or the regex went stale.
    for (const known of ["Chip", "Dialog", "Input", "SegmentedControl"]) {
      expect(names, `${known} 을 못 찾았다 — 추출 규칙이 낡았다`).toContain(known);
    }
  });

  it.each(SKILL_COPIES)("%s 가 모든 프리미티브를 이름으로 라우팅한다", (skillPath) => {
    const skill = readSkillProcedure(path.join(ROOT, skillPath));
    const missing = components
      .filter(([, name]) => !new RegExp(`\\b${name}\\b`).test(skill))
      .map(([rel, name]) => `${name} (${rel})`);
    expect(
      missing,
      "A ratified primitive is missing from the routing table, so an agent following the instructions cannot reach it. " +
        "Add a row to the shared section 1 table of `/ui-build`.",
    ).toEqual([]);
  });

  /* ── Standing probes (/gate-probe: passing is not evidence) ── */
  it("프로브: 컴포넌트만 세고 타입·상수는 세지 않는다", () => {
    const sample = [
      "export function Dialog() {}",
      "export const Input = forwardRef(function Input() {});",
      "export type DialogProps = { a: 1 };",
      "export interface InputProps { a: 1 }",
      "export const CHROME_STATUS_CHIP_CLASS = 'x';",
      "export const useThing = () => {};",
    ].join("\n");
    expect(exportedComponents(sample)).toEqual(["Dialog", "Input"]);
  });
});
