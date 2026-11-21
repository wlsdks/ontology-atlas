import { describe, expect, it } from 'vitest';

import type { AcpSessionChoices } from '../acp-client';

import { keptModelToApply } from './open-session';

function choicesOffering(modelIds: string[], currentModelId: string | null): AcpSessionChoices {
  return {
    models: modelIds.map((id) => ({ id, name: id, description: null })),
    currentModelId,
    modes: [],
    currentModeId: null,
    unverifiedModeIds: [],
    droppedModeCount: 0,
  };
}

describe('the model kept for a folder, applied to a new conversation', () => {
  it('applies it when this adapter offers it and the session is on another model', () => {
    expect(keptModelToApply(choicesOffering(['large', 'small'], 'small'), 'large')).toBe('large');
  });

  it('applies nothing when none was kept or the session already uses it', () => {
    expect(keptModelToApply(choicesOffering(['large'], null), null)).toBeNull();
    expect(keptModelToApply(choicesOffering(['large'], 'large'), 'large')).toBeNull();
  });

  it('leaves the adapter on its own model when the kept one is no longer offered', () => {
    expect(keptModelToApply(choicesOffering(['small'], 'small'), 'retired')).toBeNull();
    expect(keptModelToApply(choicesOffering([], null), 'large')).toBeNull();
  });
});
