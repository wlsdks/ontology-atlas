import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 남의 제품 이름을 **그쪽이 허용한 형태로만** 쓴다.
 *
 * ## 왜 이 게이트가 있나 (2026-08-16)
 *
 * 앱 안 에이전트 목록의 이름을 레지스트리의 `Claude Agent` 에서 `Claude Code` 로
 * 덮어썼었다. 근거는 *"아무도 Claude Agent 라고 안 부른다"* 였고, 실제로 그건
 * Anthropic 이 **명시적으로 금지한** 이름이다:
 *
 * > **Not permitted:** "Claude Code" or "Claude Code Agent"
 * > **Allowed:** "Claude Agent", preferred for **dropdown menus**;
 * >   "Claude", when within a menu already labeled "Agents"
 * > — Claude Agent SDK 문서 「Branding guidelines」
 * >   https://code.claude.com/docs/en/agent-sdk/overview
 *
 * 레지스트리는 이미 허용된 이름을 쓰고 있었다 — **우리가 고쳐서 깬 것**이다.
 * 그리고 이건 눈으로 못 잡는다: 화면에는 그냥 익숙한 이름이 떠 있을 뿐이고,
 * lint 도 타입도 통과하며, 아무도 어기고 있다고 못 느낀다.
 *
 * ## 무엇을 검사하고 무엇을 검사하지 않나
 *
 * **검사한다**: 우리가 내놓는 에이전트 목록의 **표시 이름**. 그 목록이 곧
 * 저 인용문의 「dropdown menu」다.
 *
 * **검사하지 않는다**: 사용자가 자기 컴퓨터에 따로 설치한 그 제품을 가리키는
 * 문장(MCP 연결 안내의 「Claude Code 에 연결」 등). 그건 남의 제품을 **그 제품의
 * 실제 이름으로 부르는 것**이고, 거기서 이름을 바꾸면 안내가 틀린 안내가 된다.
 * 금지되는 것은 우리 제품이 내놓는 에이전트에 그 이름을 붙이는 것이다.
 */

const ROOT = join(import.meta.dirname, '..', '..');

interface RegistryAgent {
  id: string;
  name: string;
}

const REGISTRY = JSON.parse(
  readFileSync(join(ROOT, 'src-tauri', 'src', 'acp-registry.json'), 'utf8'),
) as { agents: RegistryAgent[] };

/** 우리 목록의 표시 이름에 쓰면 안 되는 것. 정본은 각 벤더의 브랜드 가이드다. */
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

  it('claude 어댑터는 레지스트리가 준 허용된 이름을 그대로 쓴다', () => {
    const claude = REGISTRY.agents.find((a) => a.id === 'claude-acp');
    expect(claude, 'claude-acp 가 목록에서 사라졌다면 이 계약을 다시 볼 때다').toBeDefined();
    // 허용 목록: "Claude Agent" · "Claude"(목록 이름이 Agents 일 때).
    expect(claude!.name).toMatch(/^Claude( Agent)?$/);
  });

  it('빌드 스크립트가 그 이름을 다시 덮어쓰지 않는다', () => {
    /*
     * 값이 아니라 **경로**를 막는다. 표시 이름을 바꿀 수 있는 자리는
     * `DISPLAY_NAME` 하나뿐이고, 거기에 claude 항목이 생기면 위 검사가 통과해도
     * 다음 갱신에서 다시 깨질 수 있다 — 그때는 아무도 안 보고 있다.
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
    // 규칙만 있고 출처가 없으면 다음 사람이 「왜 이렇게 불편하게 쓰지」 하고 되돌린다.
    const script = readFileSync(join(ROOT, 'scripts', 'build-acp-registry.mjs'), 'utf8');
    expect(script).toContain('code.claude.com/docs/en/agent-sdk/overview');
  });
});
