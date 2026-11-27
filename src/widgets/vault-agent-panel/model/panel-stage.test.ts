import { describe, expect, it } from 'vitest';

import { agentPanelStage, canSendDraft } from './panel-stage';

const connected = { vaultPath: '/vault', provider: 'anthropic' as const };

describe('agentPanelStage', () => {
  it('names the first thing that is missing, in the order a person fixes it', () => {
    expect(
      agentPanelStage({ ...connected, vaultPath: null, provider: null, scopeAccepted: true }),
    ).toEqual({ kind: 'no-folder' });
    expect(agentPanelStage({ ...connected, vaultPath: '', scopeAccepted: true })).toEqual({
      kind: 'no-folder',
    });
    expect(agentPanelStage({ ...connected, provider: null, scopeAccepted: true })).toEqual({
      kind: 'no-key',
    });
  });

  it('asks for consent before the conversation and carries the provider from then on', () => {
    expect(agentPanelStage({ ...connected, scopeAccepted: false })).toEqual({
      kind: 'scope',
      provider: 'anthropic',
    });
    expect(agentPanelStage({ ...connected, provider: 'local', scopeAccepted: true })).toEqual({
      kind: 'chat',
      provider: 'local',
    });
  });
});

describe('canSendDraft', () => {
  const chat = { kind: 'chat', provider: 'anthropic' } as const;
  const idle = {
    stage: chat,
    running: false,
    choosingSource: false,
    applying: false,
    draft: 'hello',
  };

  it('sends only a non-blank draft in a quiet chat', () => {
    expect(canSendDraft(idle)).toBe(true);
    expect(canSendDraft({ ...idle, draft: '  \n ' })).toBe(false);
    expect(canSendDraft({ ...idle, running: true })).toBe(false);
    expect(canSendDraft({ ...idle, choosingSource: true })).toBe(false);
    expect(canSendDraft({ ...idle, applying: true })).toBe(false);
  });

  it('never sends before consent is given', () => {
    expect(canSendDraft({ ...idle, stage: { kind: 'scope', provider: 'anthropic' } })).toBe(false);
    expect(canSendDraft({ ...idle, stage: { kind: 'no-key' } })).toBe(false);
  });
});
