import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readSkillProcedure } from '../helpers/read-skill-procedure';

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
describe.each(['.claude', '.agents'])('design-build references in %s', (tree) => {
  const recipe = readSkillProcedure(join(ROOT, `${tree}/skills/design-build/SKILL.md`));

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
    expect(existsSync(join(ROOT, file)), `${file} 이 없다`).toBe(true);
    expect(read(file), `${file} 이 ${name} 를 안 내보낸다`).toMatch(
      new RegExp(`export (const|function) ${name}\\b`),
    );
  });

  /** The instruments the recipe tells you to run. */
  const PRESCRIBED_INSTRUMENTS = [
    'scripts/measure-graph-readability.mjs',
    'scripts/measure-contrast.mjs',
    `${tree}/skills/design-audit/SKILL.md`,
    `${tree}/skills/motion-verify/SKILL.md`,
    `${tree}/skills/responsive-sweep/SKILL.md`,
    `${tree}/skills/design-directions/SKILL.md`,
    `${tree}/skills/gate-probe/SKILL.md`,
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
    expect(existsSync(join(ROOT, path)), `${path} 이 없다`).toBe(true);
  });

  /** Backticked tokens, the shape the recipe cites a file or a gate in. */
  const cited = [...recipe.matchAll(/`([^`\s]+)`/g)].map((match) => match[1]);

  it('every backticked repo path the recipe cites exists', () => {
    // Only tokens under a tracked top-level entry count as repo paths, so a gitignored
    // folder or a word pair such as `light/dark` never reads as a citation.
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
    const trackedSet = new Set(tracked);
    const topLevel = new Set(tracked.map((file) => file.split('/')[0]));
    const paths = [
      ...new Set(
        cited.filter((token) => /^\.?[a-z][\w.-]*\/[\w./-]*$/i.test(token) && topLevel.has(token.split('/')[0])),
      ),
    ];
    expect(paths.length, 'recipe cites no repo path').toBeGreaterThanOrEqual(1);
    const missing = paths.filter(
      (p) => !trackedSet.has(p.replace(/\/$/, '')) && !tracked.some((file) => file.startsWith(p.endsWith('/') ? p : `${p}/`)),
    );
    expect(missing, 'recipe cites paths that do not exist').toEqual([]);
  });

  it('every backticked ratchet the recipe names resolves to a test file', () => {
    const tests = [
      ...readdirSync(join(ROOT, 'tests/contract')),
      ...readdirSync(join(ROOT, 'tests/e2e')),
    ];
    const ratchets = [...new Set(cited.filter((token) => /^[a-z0-9-]+-ratchet$/.test(token)))];
    expect(ratchets.length, 'recipe names no ratchet').toBeGreaterThanOrEqual(1);
    const missing = ratchets.filter(
      (name) => !tests.some((file) => file === `${name}.contract.test.ts` || file === `${name}.spec.ts`),
    );
    expect(missing, 'recipe names ratchets with no test file').toEqual([]);
  });
});
