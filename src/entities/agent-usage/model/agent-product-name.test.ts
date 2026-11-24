import { describe, expect, it } from 'vitest';

import { agentProductName } from './agent-product-name';

describe('agentProductName', () => {
  it('prefers the label the agent reported', () => {
    expect(agentProductName('claude-acp', 'Claude Code 2')).toBe('Claude Code 2');
  });

  it.each([
    ['claude-acp', 'Claude Agent'],
    ['gemini', 'Gemini CLI'],
    ['claude-code', 'Claude Code'],
    ['codex-mcp-client', 'Codex'],
  ])('names id %s as %s from the bundled list or the known product names', (id, name) => {
    expect(agentProductName(id)).toBe(name);
  });

  it('names nothing for an id no list knows, so the raw id never shows', () => {
    expect(agentProductName('my-review-bot')).toBeNull();
    expect(agentProductName('  ')).toBeNull();
    expect(agentProductName(null)).toBeNull();
  });
});
