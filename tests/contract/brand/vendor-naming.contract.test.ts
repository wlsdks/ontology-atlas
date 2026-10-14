import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Another company's product name is used only in the form they permit. The agent list display names
 * use `Claude Agent`, never `Claude Code`. Sentences naming a separately installed product by its real
 * name are not checked.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

interface RegistryAgent {
  id: string;
  name: string;
}

const REGISTRY = JSON.parse(
  readFileSync(join(ROOT, 'src-tauri', 'src', 'acp-registry.json'), 'utf8'),
) as { agents: RegistryAgent[] };

/** Names that must not appear as display names in our list. The authority is each vendor's brand guide. */
const FORBIDDEN_DISPLAY_NAMES = [
  { pattern: /^claude code( agent)?$/i, source: 'Anthropic Claude Agent SDK · Branding guidelines' },
];

describe('남의 제품 이름 — 그쪽이 허용한 형태로만', () => {
  it('에이전트 목록의 표시 이름이 금지된 형태가 아니다', () => {
    for (const agent of REGISTRY.agents) {
      for (const rule of FORBIDDEN_DISPLAY_NAMES) {
        expect(
          rule.pattern.test(agent.name.trim()),
          `${agent.id} 의 표시 이름 "${agent.name}" 은 허용되지 않는다 (${rule.source})`,
        ).toBe(false);
      }
    }
  });

  it('**우리 목록을 설명하는 문구**도 같은 규칙을 지킨다', () => {
    /*
     * Only the copy describing our own runner list is checked, not all copy: more than 20 legitimate
     * places name someone else's product, and widening the rule would bury the real violation in noise.
     */
    const NAMESPACES = [
      ['nav', 'settingsMenu', 'runtimes'],
      ['topology', 'startSteps', 'agent'],
    ];
    for (const locale of ['ko', 'en']) {
      const catalog = JSON.parse(
        readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8'),
      ) as Record<string, unknown>;
      for (const path of NAMESPACES) {
        let node: unknown = catalog;
        for (const key of path) node = (node as Record<string, unknown>)?.[key];
        const found: string[] = [];
        const walk = (value: unknown, trail: string) => {
          if (typeof value === 'string') {
            if (/claude code/i.test(value)) found.push(`${trail}: ${value}`);
            return;
          }
          if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) walk(v, `${trail}.${k}`);
          }
        };
        walk(node, `${locale}.${path.join('.')}`);
        expect(
          found,
          'Copy that describes our list of runners uses the same names as the registry ' +
            '(Anthropic Claude Agent SDK · Branding guidelines)',
        ).toEqual([]);
      }
    }
  });

  it('claude 어댑터는 레지스트리가 준 허용된 이름을 그대로 쓴다', () => {
    const claude = REGISTRY.agents.find((a) => a.id === 'claude-acp');
    expect(claude, 'claude-acp 가 목록에서 사라졌다면 이 계약을 다시 볼 때다').toBeDefined();
    // Allowed: "Claude Agent", and "Claude" when the list itself is named Agents.
    expect(claude!.name).toMatch(/^Claude( Agent)?$/);
  });

  it('빌드 스크립트가 그 이름을 다시 덮어쓰지 않는다', () => {
    /*
     * Blocks the **path**, not the value. `DISPLAY_NAME` is the only place a display
     * name can be changed, and a claude entry appearing there can break this again at
     * the next update even while the check above passes — and by then nobody is
     * watching.
     */
    const script = readFileSync(join(ROOT, 'scripts', 'registry-snapshots', 'build-acp-registry.mjs'), 'utf8');
    const block = /const DISPLAY_NAME = \{([\s\S]*?)\};/.exec(script);
    expect(block, 'DISPLAY_NAME 이 사라졌다면 이 계약을 다시 볼 때다').not.toBeNull();
    expect(
      /claude/i.test(block![1]),
      'DISPLAY_NAME 에 claude 항목이 생겼다 — 브랜드 가이드를 먼저 확인하라',
    ).toBe(false);
  });

  it('근거가 문서에 남아 있다', () => {
    // A rule with no cited source gets reverted by the next person as needless inconvenience.
    const script = readFileSync(join(ROOT, 'scripts', 'registry-snapshots', 'build-acp-registry.mjs'), 'utf8');
    expect(script).toContain('code.claude.com/docs/en/agent-sdk/overview');
  });
});
