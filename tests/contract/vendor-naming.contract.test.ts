import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Use another company's product name **only in the form they permit.**
 *
 * ## Why this gate exists (2026-08-16)
 *
 * The in-app agent list's name was overridden from the registry's `Claude Agent` to
 * `Claude Code`, on the grounds that *"nobody calls it Claude Agent"*. That name is
 * one Anthropic **explicitly forbids**:
 *
 * > **Not permitted:** "Claude Code" or "Claude Code Agent"
 * > **Allowed:** "Claude Agent", preferred for **dropdown menus**;
 * >   "Claude", when within a menu already labeled "Agents"
 * > — Claude Agent SDK documentation, "Branding guidelines"
 * >   https://code.claude.com/docs/en/agent-sdk/overview
 *
 * The registry was already using a permitted name — **we broke it by "fixing" it.**
 * And this cannot be caught by eye: the screen simply shows a familiar name, lint
 * and types pass, and nobody feels a rule is being broken.
 *
 * ## What is checked and what is not
 *
 * **Checked**: the **display names** in the agent list we ship. That list is the
 * "dropdown menu" in the quotation above.
 *
 * **Not checked**: sentences referring to a product the user installed separately on
 * their own machine (for example "connect to Claude Code" in the MCP setup
 * guidance). That is **calling someone else's product by its real name**, and
 * changing it there would make the guidance wrong. What is forbidden is attaching
 * that name to an agent our product ships.
 */

const ROOT = join(import.meta.dirname, '..', '..');

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
     * ⚠️ This gate had a hole (found in review, 2026-08-16). It looked only at the
     * registry's `name`, leaving **on-screen copy** out of range — and the runner
     * list's empty state really did say "install Claude Code or Codex…". The list's
     * names obeyed the rule while the sentence describing the list did not.
     *
     * ⚠️ **Do not widen the range to all copy.** This app has more than 20 places that
     * **name the product itself**, such as "connect to Claude Code", and those are
     * legitimate (calling someone else's product by its own name). Switching the rule
     * on that way turns 20 legitimate places into noise and buries the real violation —
     * the reason this repository records "count the violations before switching a rule
     * on".
     *
     * So only **the places describing our runner list** are checked.
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
          '우리 실행기 목록을 설명하는 문구는 레지스트리와 같은 이름을 쓴다 ' +
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
    const script = readFileSync(join(ROOT, 'scripts', 'build-acp-registry.mjs'), 'utf8');
    const block = /const DISPLAY_NAME = \{([\s\S]*?)\};/.exec(script);
    expect(block, 'DISPLAY_NAME 이 사라졌다면 이 계약을 다시 볼 때다').not.toBeNull();
    expect(
      /claude/i.test(block![1]),
      'DISPLAY_NAME 에 claude 항목이 생겼다 — 브랜드 가이드를 먼저 확인하라',
    ).toBe(false);
  });

  it('근거가 문서에 남아 있다', () => {
    // A rule with no cited source gets reverted by the next person as needless inconvenience.
    const script = readFileSync(join(ROOT, 'scripts', 'build-acp-registry.mjs'), 'utf8');
    expect(script).toContain('code.claude.com/docs/en/agent-sdk/overview');
  });
});
