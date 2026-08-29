import { describe, expect, it } from 'vitest';
import type { AgentWorkProjection } from './agent-work-projection';
import { isVerifiedMascotCompletion, isVerifiedMascotRead } from './mascot-state';

const work = (overrides: Partial<AgentWorkProjection> = {}): AgentWorkProjection => ({
  mode: 'idle',
  agentName: null,
  rawAgentName: null,
  phase: null,
  summary: null,
  targetSlug: null,
  files: [],
  nextStep: null,
  lastTool: null,
  updatedAt: null,
  ...overrides,
});

describe('truthful mascot state', () => {
  it.each(['list_concepts', 'get_concept', 'query_ontology centrality', 'validate_vault'])(
    'accepts verified read tool %s',
    (lastTool) => {
      expect(isVerifiedMascotRead(work({ mode: 'live', phase: 'planning', lastTool }))).toBe(true);
    },
  );

  it('does not turn a phase label or a write tool into a read claim', () => {
    expect(isVerifiedMascotRead(work({ mode: 'live', phase: 'planning' }))).toBe(false);
    expect(
      isVerifiedMascotRead(work({ mode: 'live', phase: 'editing', lastTool: 'patch_concept' })),
    ).toBe(false);
  });

  it('requires a timestamped terminal projection for success', () => {
    expect(isVerifiedMascotCompletion(work({ mode: 'completed', updatedAt: 42 }))).toBe(true);
    expect(isVerifiedMascotCompletion(work({ mode: 'completed' }))).toBe(false);
    expect(isVerifiedMascotCompletion(work({ mode: 'recent-write', updatedAt: 42 }))).toBe(false);
  });
});
