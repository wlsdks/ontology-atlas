import { describe, expect, it } from 'vitest';

import { composerStatusLive, toolRowPhase, WORKING_SHIMMER_CLASS, workingShimmer } from './working-ink';

describe('working ink', () => {
  it('gives the shimmer only to work still in flight', () => {
    expect(workingShimmer(true)).toBe(WORKING_SHIMMER_CLASS);
    expect(workingShimmer(false)).toBeUndefined();
  });

  it('animates the composer status only while the agent itself is working', () => {
    expect(composerStatusLive('thinking', false)).toBe(true);
    // Blocked on the person's answer: the work waits on them, not on the agent.
    expect(composerStatusLive('awaiting', false)).toBe(false);
    // A silent turn has its own sentence; a sweep would claim output that is not arriving.
    expect(composerStatusLive('thinking', true)).toBe(false);
    for (const settled of ['ready', 'starting', 'error', 'closed']) {
      expect(composerStatusLive(settled, false)).toBe(false);
    }
  });

  it('stills a call that waits on the person, and only a call still open can wait', () => {
    expect(toolRowPhase(true, false)).toBe('running');
    expect(toolRowPhase(true, true)).toBe('awaiting');
    expect(toolRowPhase(false, true)).toBe('settled');
    expect(toolRowPhase(false, false)).toBe('settled');
    expect(workingShimmer(toolRowPhase(true, true) === 'running')).toBeUndefined();
  });
});
