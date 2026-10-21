import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Prose in the settings sheet keeps the reading measure (`--measure-stage-column`) on the one head every
 * pane opens with (`docs/DESIGN-SYSTEM.md`).
 */

const ROOT = process.cwd();
const PRIMITIVES = readFileSync(
  path.join(ROOT, 'src/widgets/app-settings-menu/ui/settings-primitives.tsx'),
  'utf8',
);
const CSS = readGlobalCss();

describe('settings sheet — prose keeps a readable measure', () => {
  it('the window lead sentence uses the prose measure', () => {
    expect(CSS).toMatch(/--measure-stage-column:\s*\d+px/);
    const head = PRIMITIVES.slice(PRIMITIVES.indexOf('export function SettingsPaneHead'));
    expect(
      (head.slice(0, head.indexOf('\n}\n')).match(/max-w-\[var\(--measure-stage-column\)\]/g) ?? []).length,
      'the window lead sentence does not use the prose measure',
    ).toBe(1);
  });

  it('the retired row measure token does not come back', () => {
    expect(CSS).not.toContain('--settings-content-measure');
  });
});
