import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Ratifying a primitive means updating the signpost with it** (2026-08-15).
 *
 * **Why this gate exists — a real-use trial caught it.** Portability trial,
 * 2026-08-15: an agent that did not know this repository was handed only the design
 * system bundle and asked to build three screens containing forms. The five
 * primitives ratified that same day (`Input` · `Textarea` · `Checkbox` ·
 * `SegmentedControl` · `Select`) appeared **zero times** in the `/design-build`
 * routing table, whose last row said "a shape not among those eight → stop and
 * recount everything". In other words, **an agent following instructions receives a
 * stop signal on forms.** That agent did in fact abandon the signpost and recovered
 * by opening 12 `ui/` sources directly — the primitives existed, the gates existed,
 * and **only the signpost did not point there.**
 *
 * The diagnosis `/design-build` wrote in its own preamble recurred one layer up:
 * *"what was blocking this was not the model's taste but the absence of parts to
 * reach for and of a written order of operations"*. The parts arrived and **the
 * order of operations did not follow.**
 *
 * **What it enforces.** Every **component name** exported by a file in the spec
 * watch list (`PRIMITIVE_EXPORT_FILES` in `design-spec-census.mjs`) must appear by
 * name in the `/design-build` signpost. The list is extracted from source rather
 * than maintained by hand — the moment a new primitive is registered, this check
 * demands its name.
 *
 * **Both** copies (`.claude` and `.agents`) are checked. Fixing one only is caught
 * by `agents:check`'s `skill-copy`, but that asks whether the two copies match, not
 * whether the content is current.
 */

const ROOT = process.cwd();

/**
 * The **primitive-layer files** whose routing the signpost is responsible for.
 *
 * Based on `PRIMITIVE_EXPORT_FILES` in `design-spec-census.mjs`, plus `button.tsx`
 * and `select.tsx` — their value axes live in `control-class.ts` so they are not
 * watched by the spec ledger, but they are **parts anyone building a screen must
 * reach**, which puts them in the signpost's scope (in the 2026-08-15 trial
 * `Select` was absent from the table and really could not be found).
 */
const PRIMITIVE_FILES = [
  "src/shared/ui/controls.tsx",
  "src/shared/ui/surface.tsx",
  "src/shared/ui/dialog.tsx",
  "src/shared/ui/input.tsx",
  "src/shared/ui/checkbox.tsx",
  "src/shared/ui/segmented-control.tsx",
  "src/shared/ui/button.tsx",
  "src/shared/ui/select.tsx",
] as const;

const SKILL_COPIES = [
  ".claude/skills/design-build/SKILL.md",
  ".agents/skills/design-build/SKILL.md",
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
    const skill = readFileSync(path.join(ROOT, skillPath), "utf8");
    const missing = components
      .filter(([, name]) => !new RegExp(`\\b${name}\\b`).test(skill))
      .map(([rel, name]) => `${name} (${rel})`);
    expect(
      missing,
      "비준한 부품이 안내판에 없다 — 지시를 따르는 에이전트는 그 부품에 도달할 수 없다. " +
        "`/design-build` 1절 표에 행을 더하고 **두 사본 모두** 고쳐라.",
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
