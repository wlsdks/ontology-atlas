import { describe, expect, it } from 'vitest';

import { sessionSystemPrompt, vaultHandoffPrompt } from './vault-handoff-prompt';

describe('the handoff the agent reads when a conversation opens', () => {
  it('claims the vault server and the construction card only when that server is wired', () => {
    const wired = vaultHandoffPrompt(true, 'en');
    const unwired = vaultHandoffPrompt(false, 'en');
    expect(wired).toContain('`atlas-vault` MCP server is already connected');
    expect(wired).toContain('construction card');
    expect(unwired).not.toContain('`atlas-vault`');
    expect(unwired).not.toContain('construction card');
  });

  it('opens with the same first sentence either way and states the answer language once', () => {
    for (const wired of [true, false]) {
      const prompt = vaultHandoffPrompt(wired, 'ko');
      expect(prompt.startsWith('You are working inside an Ontology Atlas vault')).toBe(true);
      expect(prompt).not.toContain('__ANSWER_LANGUAGE__');
      expect(prompt.match(/Answer in Korean/g)).toHaveLength(1);
    }
  });

  it('appends the screen paragraph after the handoff and ignores a blank one', () => {
    const handoff = vaultHandoffPrompt(true, 'en');
    expect(sessionSystemPrompt(true, 'en', '  Stay on the Library wiki.  ')).toBe(`${handoff} Stay on the Library wiki.`);
    expect(sessionSystemPrompt(true, 'en', '   ')).toBe(handoff);
    expect(sessionSystemPrompt(true, 'en', null)).toBe(handoff);
  });
});
