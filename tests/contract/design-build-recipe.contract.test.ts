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
});
