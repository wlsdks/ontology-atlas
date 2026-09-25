import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prose in the settings sheet keeps the prose measure.
 *
 * Until 2026-09-25 this file also locked `--settings-content-measure`, the row width the API Key
 * drill-in shared with the root face (the drill-in had once spread its rows to 846px). That pane
 * moved to the Agents destination's models tab, where rows take the destination frame's width
 * like the tab beside them; the token lost its last consumer and was retired with its checks
 * (`docs/DESIGN-SYSTEM.md`, "Settings Sheet Row Measurement Width").
 *
 * What stays true: a sentence in the sheet is read, not operated, so it keeps the reading
 * measure (`--git-setup-measure`) — on the one head every pane opens with.
 */

const ROOT = process.cwd();
const PRIMITIVES = readFileSync(
  path.join(ROOT, 'src/widgets/app-settings-menu/ui/settings-primitives.tsx'),
  'utf8',
);
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

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
