import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `/design-build` 레시피가 **실재하는 것만 가리키는지** 확인한다.
 *
 * ## 왜 이 게이트인가
 *
 * 이 저장소의 문서 규율(`documentation.md`): **기계가 만들 수 있는 것만 검사한다.
 * 사람이 판단해 쓴 문장은 검사하지 않는다.** 그래서 이 파일은 레시피의 산문을
 * 못박지 않는다 — 대신 **참조 무결성**만 본다: 레시피가 「이걸 써라」고 말하는
 * 프리미티브·계기·게이트가 실제로 존재하는가.
 *
 * 이게 필요한 이유는 레시피의 실패 모드가 특이해서다. 프리미티브 이름이 바뀌거나
 * 게이트가 사라져도 **문서는 그대로 통과한다** — 그리고 그 문서를 읽은 다음
 * 에이전트가 없는 것을 쓰려다 실패한다. 「명령만 하면 화면이 나온다」의 신뢰가
 * 정확히 거기서 깨진다.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SKILL = '.claude/skills/design-build/SKILL.md';
const MIRROR = '.agents/skills/design-build/SKILL.md';

describe('design-build 레시피 — 참조 무결성', () => {
  const recipe = read(SKILL);

  it('두 벌이 바이트 동일하다 — Codex 는 `.claude` 를 못 읽는다', () => {
    expect(read(MIRROR)).toBe(recipe);
  });

  /** 레시피가 「이걸 써라」고 지목하는 것들. 하나라도 없으면 레시피가 거짓말이다. */
  const PRESCRIBED_PRIMITIVES: Array<[name: string, file: string]> = [
    ['Chip', 'src/shared/ui/controls.tsx'],
    ['IconButton', 'src/shared/ui/controls.tsx'],
    ['RowButton', 'src/shared/ui/controls.tsx'],
    ['Button', 'src/shared/ui/button.tsx'],
    ['Surface', 'src/shared/ui/surface.tsx'],
    ['controlClass', 'src/shared/ui/control-class.ts'],
  ];

  it.each(PRESCRIBED_PRIMITIVES)('`%s` 를 처방하고, 그것이 실재한다', (name, file) => {
    expect(recipe, `레시피가 ${name} 를 안 가리킨다`).toContain(name);
    expect(existsSync(join(ROOT, file)), `${file} 이 없다`).toBe(true);
    expect(read(file), `${file} 이 ${name} 를 안 내보낸다`).toMatch(
      new RegExp(`export (const|function) ${name}\\b`),
    );
  });

  /** 레시피가 「돌려라」고 말하는 계기들. */
  const PRESCRIBED_INSTRUMENTS = [
    'scripts/measure-graph-readability.mjs',
    'scripts/measure-contrast.mjs',
    '.claude/skills/design-audit/SKILL.md',
    '.claude/skills/motion-verify/SKILL.md',
    '.claude/skills/responsive-sweep/SKILL.md',
    '.claude/skills/design-directions/SKILL.md',
    '.claude/skills/gate-probe/SKILL.md',
  ];

  it.each(PRESCRIBED_INSTRUMENTS)('%s 가 실재한다', (path) => {
    expect(existsSync(join(ROOT, path)), `${path} 이 없다`).toBe(true);
  });

  /**
   * 레시피가 「너를 막을 것」이라고 예고하는 게이트들. **이 목록이 어긋나면
   * 레시피는 없는 문지기를 경고하거나 있는 문지기를 숨긴다.**
   */
  const ANNOUNCED_GATES = [
    ['control-adoption-ratchet', 'tests/contract/control-adoption-ratchet.contract.test.ts'],
    ['surface-motion-ratchet', 'tests/contract/surface-motion-ratchet.contract.test.ts'],
    ['contrast-ratchet', 'tests/e2e/contrast-ratchet.spec.ts'],
    ['a11y-ratchet', 'tests/e2e/a11y-ratchet.spec.ts'],
    ['disabled-affordance', 'tests/contract/disabled-affordance.contract.test.ts'],
    ['control-class', 'tests/contract/control-class.contract.test.ts'],
  ] as const;

  it.each(ANNOUNCED_GATES)('`%s` 를 예고하고, 그 게이트가 실재한다', (name, path) => {
    expect(recipe, `레시피가 ${name} 를 안 예고한다`).toContain(name);
    expect(existsSync(join(ROOT, path)), `${path} 이 없다`).toBe(true);
  });

  it('첫 명령이 `pnpm checks:changed` 다 — 손으로 쓴 목록은 늘 좁다', () => {
    // AGENTS.md 의 규율 그대로: 브리핑할 때 검사를 열거하지 말고 명령을 가리킨다.
    expect(recipe).toContain('pnpm checks:changed');
  });

  it('발산 단계를 앞에 둔다 — 카운슬이 갈래 탐색을 대신하지 않게', () => {
    expect(recipe).toContain('design-directions');
  });
});
