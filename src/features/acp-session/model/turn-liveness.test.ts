import { describe, expect, it } from 'vitest';

import { TURN_SILENCE_LIMIT_MS, turnLiveness } from './turn-liveness';

/**
 * ⚠️ These hold the difference between "still working" and "stopped answering" — the distinction a
 * person could not make in the installed rc.11 build, where a finished turn looked exactly like a
 * running one and locked the composer for thirteen minutes.
 */
describe('turn-liveness — 아직 일하는 중인지, 대답을 멈춘 것인지', () => {
  it('턴이 열려 있지 않으면 판정하지 않는다', () => {
    for (const status of ['ready', 'idle', 'starting', 'error', 'exited']) {
      expect(turnLiveness(status, 0, Number.MAX_SAFE_INTEGER)).toBe('idle');
    }
  });

  /*
   * ⚠️ The turn opens before any update exists. Treating a missing timestamp as "silent since the
   * epoch" would flag every turn on its first frame, which is the opposite failure: the screen would
   * cry stall while the agent is starting normally.
   */
  it('막 시작해 아직 소식이 없는 턴은 멈춘 것이 아니다', () => {
    expect(turnLiveness('thinking', null, 1_000_000)).toBe('working');
  });

  it('갱신이 계속 오는 동안은 아무리 길어도 살아 있다', () => {
    const start = 1_000_000;
    // A sweep that has run twenty minutes but spoke one second ago is working, not stalled. The
    // no-timeout rule for `prompt` exists for exactly this turn.
    expect(turnLiveness('thinking', start + 20 * 60_000, start + 20 * 60_000 + 1_000)).toBe(
      'working',
    );
  });

  it('한계만큼 조용하면 멈춘 것으로 본다', () => {
    const t = 1_000_000;
    expect(turnLiveness('thinking', t, t + TURN_SILENCE_LIMIT_MS - 1)).toBe('working');
    expect(turnLiveness('thinking', t, t + TURN_SILENCE_LIMIT_MS)).toBe('silent');
    expect(turnLiveness('thinking', t, t + 13 * 60_000)).toBe('silent');
  });

  it('한계는 호출자가 정할 수 있다 — 시험이 실시간을 기다리지 않도록', () => {
    expect(turnLiveness('thinking', 0, 50, 100)).toBe('working');
    expect(turnLiveness('thinking', 0, 100, 100)).toBe('silent');
  });

  /*
   * ⚠️ The limit guards a person's patience, not a machine's. Set it below the real gap between
   * steps and the screen calls a healthy sweep stalled, which teaches people to ignore the warning.
   */
  it('한계는 실제 단계 간격보다 충분히 크다', () => {
    expect(TURN_SILENCE_LIMIT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
