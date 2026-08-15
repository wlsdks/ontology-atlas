import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **부품을 비준했으면 안내판도 같이 고친다** (2026-08-15).
 *
 * ## 왜 이 게이트가 생겼나 — 실사용 시험이 잡았다
 *
 * 2026-08-15 이식성 시험: 이 저장소를 모르는 에이전트에게 디자인 시스템 꾸러미만
 * 주고 폼이 든 화면 셋을 시켰다. 같은 날 비준된 새 부품 다섯(`Input` ·
 * `Textarea` · `Checkbox` · `SegmentedControl` · `Select`)이 `/design-build`
 * 라우팅 표에 **0건** 실려 있었고, 표의 마지막 줄은 「그 여덟에도 없는 모양 →
 * 멈추고 전체를 다시 센다」였다. 즉 **지시대로 따르는 에이전트는 폼에서 정지
 * 신호를 받는다.** 실제로 그 에이전트는 안내판을 포기하고 `ui/` 소스 12개를
 * 직접 열어 복구했다 — 부품도 게이트도 있는데 **안내판만 그리로 안 갔다.**
 *
 * `/design-build` 자신이 서두에 적어 둔 진단이 한 층 위에서 재발한 것이다:
 * *"막고 있던 것은 모델의 취향이 아니라 가져다 쓸 부품이 없다는 것과 작업
 * 순서가 안 적혀 있다는 것"*. 부품은 생겼고 **작업 순서가 안 따라왔다.**
 *
 * ## 무엇을 강제하나
 *
 * 규격 감시 목록(`design-spec-census.mjs` 의 `PRIMITIVE_EXPORT_FILES`)에 있는
 * 파일이 내보내는 **컴포넌트 이름**은 전부 `/design-build` 안내판에 이름으로
 * 나와야 한다. 목록은 손으로 관리하지 않고 소스에서 뽑는다 — 새 프리미티브가
 * 등재되는 순간 이 검사가 그 이름을 요구한다.
 *
 * 사본 둘(`.claude` · `.agents`)을 **양쪽 다** 본다. 한쪽만 고치면
 * `agents:check` 의 `skill-copy` 가 잡지만, 그건 「두 벌이 같은가」이지
 * 「내용이 최신인가」가 아니다.
 */

const ROOT = process.cwd();

/**
 * 안내판이 라우팅을 책임지는 **부품 층 파일**.
 *
 * `design-spec-census.mjs` 의 `PRIMITIVE_EXPORT_FILES` 를 바탕으로 하되
 * `button.tsx` · `select.tsx` 를 더한다 — 둘은 값 축이 `control-class.ts` 에
 * 있어 규격 원장 감시 대상은 아니지만, **화면을 짓는 사람이 반드시 도달해야
 * 하는 부품**이라 안내판의 책임 범위다(2026-08-15 시험에서 `Select` 가 표에
 * 없어 실제로 못 찾았다).
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
 * 컴포넌트 export 만 센다 — 타입(`export type` · `export interface`)과 값 층
 * 상수는 안내판이 라우팅할 대상이 아니다.
 */
export function exportedComponents(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/gm)) {
    names.add(m[1]);
  }
  // 상수(전부 대문자·밑줄)는 부품이 아니다 — CHROME_STATUS_CHIP_CLASS 류.
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
    // 이 넷이 사라졌다면 파일이 옮겨졌거나 정규식이 낡은 것이다.
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

  /* ── 상주 프로브 (/gate-probe: 통과는 증거가 아니다) ── */
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
