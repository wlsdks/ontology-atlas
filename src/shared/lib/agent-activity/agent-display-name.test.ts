import { describe, expect, it } from 'vitest';

import { agentDisplayName } from './agent-display-name';

describe('agentDisplayName', () => {
  it.each([
    ['codex-mcp-client', 'Codex'],
    ['codex-acp', 'Codex'],
    ['claude-code', 'Claude Code'],
    ['claude-acp', 'Claude Agent'],
    ['ontology-atlas-cli', 'Atlas CLI'],
  ])('내부 식별자 %s 를 제품 이름 %s 로 바꾼다', (raw, expected) => {
    expect(agentDisplayName(raw)).toBe(expected);
  });

  it('모르는 에이전트는 스스로 밝힌 이름을 보존한다', () => {
    expect(agentDisplayName('my-review-agent')).toBe('my-review-agent');
  });

  it('빈 이름은 지어내지 않는다', () => {
    expect(agentDisplayName(null)).toBeNull();
    expect(agentDisplayName('   ')).toBeNull();
  });
});
