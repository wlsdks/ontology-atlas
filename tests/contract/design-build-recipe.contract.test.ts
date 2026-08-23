import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Checks that the `/design-build` recipe **points only at things that exist**.
 *
 * This repository's documentation discipline (`documentation.md`): **check only
 * what a machine can generate; never check a sentence a person wrote.** So this
 * file pins none of the recipe's prose — it checks **referential integrity**
 * only: do the primitives, instruments, and gates the recipe tells you to use
 * actually exist?
 *
 * It is needed because the recipe's failure mode is peculiar. Rename a primitive
 * or delete a gate and **the document still passes** — then the next agent reads
 * it, reaches for something that is not there, and fails. That is exactly where
 * trust in "just ask and a screen appears" breaks.
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

  /** What the recipe tells you to use. One missing entry makes the recipe a lie. */
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

  /** The instruments the recipe tells you to run. */
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
   * The gates the recipe warns will stop you. **If this list drifts, the recipe
   * either warns about a gatekeeper that does not exist or hides one that does.**
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
    // Straight from AGENTS.md: when briefing, point at the command rather than enumerating checks.
    expect(recipe).toContain('pnpm checks:changed');
  });

  it('발산 단계를 앞에 둔다 — 카운슬이 갈래 탐색을 대신하지 않게', () => {
    expect(recipe).toContain('design-directions');
  });

  it('새 값을 만들기 전에 이미 있는지 찾으라고 말한다', () => {
    /*
     * A real failure from 2026-08-03: `--control-h-*` (28/32/40) already existed,
     * but nobody looked, 24/30/34 were invented instead, and when those values
     * collided with a contract an exemption axis was added rather than the values
     * fixed. All six other rules were followed; this one was not, and that was
     * enough.
     */
    expect(recipe, '기존 토큰을 먼저 찾으라는 절이 있어야 한다').toContain('--control-h-');
    expect(recipe).toContain('app/globals.css');
    expect(recipe, 'the recipe must point to the system-growth rules').toMatch(/System growth rules/i);
  });

  it('그 규칙 문서가 실재하고 여섯 조항을 담는다', () => {
    const ds = read('docs/DESIGN-SYSTEM.md');
    expect(ds).toMatch(/Rules for extending the system/i);
    for (const n of [0, 1, 2, 3, 4, 5, 6]) {
      expect(ds, `Rule ${n} is missing`).toMatch(new RegExp(`Rule ${n} —`));
    }
  });
});
