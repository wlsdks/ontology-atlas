import { describe, expect, it } from 'vitest';

import { readUsageUpdate } from './usage-update';

const RESET_SECONDS = 1_795_000_000;

/** The shapes `claude-agent-acp` 0.110.0 sends (`dist/v1/acp-agent.js`). */
const claudeTurnEnd = {
  sessionUpdate: 'usage_update',
  used: 42_180,
  size: 200_000,
  cost: { amount: 0.4213, currency: 'USD' },
  _meta: { '_claude/model': 'claude-opus' },
};
const claudeRateLimit = {
  sessionUpdate: 'usage_update',
  used: 42_180,
  size: 200_000,
  _meta: {
    '_claude/rateLimit': {
      status: 'allowed_warning',
      rateLimitType: 'five_hour',
      utilization: 0.81,
      resetsAt: RESET_SECONDS,
      unifiedWindows: {
        seven_day: { utilization: 0.18, resetsAt: RESET_SECONDS + 400_000, status: 'allowed' },
      },
    },
  },
};

describe('reading a usage update', () => {
  it('reads tokens, context window and the session cost from a Claude turn end', () => {
    expect(readUsageUpdate(claudeTurnEnd, 's-1')).toEqual({
      sessionId: 's-1',
      context: { usedTokens: 42_180, windowTokens: 200_000 },
      cost: { amount: 0.4213, currency: 'USD' },
      limits: {},
    });
  });

  it('reads the five-hour window from the limiting fields and the weekly one from every window', () => {
    expect(readUsageUpdate(claudeRateLimit, 's-1')?.limits).toEqual({
      fiveHour: { usedFraction: 0.81, resetsAtMs: RESET_SECONDS * 1_000 },
      weekly: { usedFraction: 0.18, resetsAtMs: (RESET_SECONDS + 400_000) * 1_000 },
    });
  });

  it('prefers every-window figures over the limiting ones for the same window', () => {
    const update = {
      ...claudeRateLimit,
      _meta: { '_claude/rateLimit': { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.5, resetsAt: RESET_SECONDS, unifiedWindows: { five_hour: { utilization: 0.52, resetsAt: RESET_SECONDS } } } },
    };
    expect(readUsageUpdate(update, 's-1')?.limits.fiveHour?.usedFraction).toBe(0.52);
  });

  it('reads tokens only from Codex, which sends no cost or limits', () => {
    expect(readUsageUpdate({ sessionUpdate: 'usage_update', used: 9_000, size: 272_000 }, 's-1')).toEqual({
      sessionId: 's-1',
      context: { usedTokens: 9_000, windowTokens: 272_000 },
      cost: null,
      limits: {},
    });
  });

  it('leaves out a cost without a currency and keeps the rest', () => {
    const report = readUsageUpdate({ ...claudeTurnEnd, cost: { amount: 0.42 } }, 's-1');
    expect(report?.cost).toBeNull();
    expect(report?.context?.usedTokens).toBe(42_180);
  });

  it.each([
    ['a non-finite token count', { used: Number.NaN, size: 200_000 }],
    ['a negative token count', { used: -1, size: 200_000 }],
    ['a zero context window', { used: 10, size: 0 }],
    ['a token count sent as text', { used: '42180', size: 200_000 }],
  ])('drops the context for %s', (_case, figures) => {
    expect(readUsageUpdate({ sessionUpdate: 'usage_update', ...figures }, 's-1')?.context).toBeNull();
  });

  it.each([
    ['a utilization on a percent scale', { utilization: 81, resetsAt: RESET_SECONDS }],
    ['a reset time in milliseconds', { utilization: 0.81, resetsAt: RESET_SECONDS * 1_000 }],
    ['a reset time that is not a whole second', { utilization: 0.81, resetsAt: RESET_SECONDS + 0.5 }],
    ['a reset time sent as text', { utilization: 0.81, resetsAt: '2026-11-24T06:00:00Z' }],
    ['no utilization', { resetsAt: RESET_SECONDS }],
    ['an infinite utilization', { utilization: Number.POSITIVE_INFINITY, resetsAt: RESET_SECONDS }],
  ])('drops a window with %s', (_case, window) => {
    const update = { sessionUpdate: 'usage_update', _meta: { '_claude/rateLimit': { status: 'allowed', rateLimitType: 'five_hour', ...window } } };
    expect(readUsageUpdate(update, 's-1')?.limits).toEqual({});
  });

  it('ignores a limit type it does not draw, even one named like an object key', () => {
    for (const rateLimitType of ['seven_day_opus', 'overage', 'constructor']) {
      const update = { sessionUpdate: 'usage_update', _meta: { '_claude/rateLimit': { rateLimitType, utilization: 0.5, resetsAt: RESET_SECONDS } } };
      expect(readUsageUpdate(update, 's-1')?.limits).toEqual({});
    }
  });

  it('reads nothing from another kind of update', () => {
    expect(readUsageUpdate({ sessionUpdate: 'agent_message_chunk', used: 1, size: 2 }, 's-1')).toBeNull();
  });
});
