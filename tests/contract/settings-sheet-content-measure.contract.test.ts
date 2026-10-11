import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * Prose in the settings sheet keeps the reading measure (`--git-setup-measure`) on the one head every
 * pane opens with (`docs/DESIGN-SYSTEM.md`).
 */

const ROOT = process.cwd();
const PRIMITIVES = readFileSync(
  path.join(ROOT, 'src/widgets/app-settings-menu/ui/settings-primitives.tsx'),
  'utf8',
);
const CSS = readGlobalCss();

describe('설정 시트 — 산문은 읽는 폭을 지킨다', () => {
  it('창 머리 문장은 산문 measure 를 쓴다', () => {
    expect(CSS).toMatch(/--git-setup-measure:\s*\d+px/);
    const head = PRIMITIVES.slice(PRIMITIVES.indexOf('export function SettingsPaneHead'));
    expect(
      (head.slice(0, head.indexOf('\n}\n')).match(/max-w-\[var\(--git-setup-measure\)\]/g) ?? []).length,
      '창 머리 문장이 산문 measure 를 안 쓴다',
    ).toBe(1);
  });

  it('은퇴한 행 측정폭 토큰이 되살아나지 않는다', () => {
    expect(CSS).not.toContain('--settings-content-measure');
  });
});
