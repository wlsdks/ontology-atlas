import { describe, expect, it } from 'vitest';

import { limitsInForce, mergeUsageReport, pressingLimit, type AgentUsage, type UsageReport } from './agent-usage';

const HOUR_MS = 3_600_000;
const NOW = Date.UTC(2026, 10, 24, 6, 0);

const report = (parts: Partial<UsageReport> = {}): UsageReport => ({
  sessionId: 's-1',
  context: null,
  cost: null,
  limits: {},
  ...parts,
});

const withLimits = (fiveHour: number | null, weekly: number | null): AgentUsage =>
  mergeUsageReport(null, 'claude-acp', report({
    limits: {
      ...(fiveHour === null ? {} : { fiveHour: { usedFraction: fiveHour, resetsAtMs: NOW + HOUR_MS } }),
      ...(weekly === null ? {} : { weekly: { usedFraction: weekly, resetsAtMs: NOW + 50 * HOUR_MS } }),
    },
  }), NOW)!;

describe('merging what an agent reports', () => {
  it('keeps the conversation cost when a later update carries tokens only', () => {
    const first = mergeUsageReport(null, 'claude-acp', report({
      context: { usedTokens: 1_000, windowTokens: 200_000 },
      cost: { amount: 0.4, currency: 'USD' },
    }), NOW);
    const second = mergeUsageReport(first, 'claude-acp', report({ context: { usedTokens: 2_000, windowTokens: 200_000 } }), NOW + 1);
    expect(second?.context).toEqual({ usedTokens: 2_000, windowTokens: 200_000, readAtMs: NOW + 1 });
    expect(second?.cost).toEqual({ amount: 0.4, currency: 'USD', readAtMs: NOW });
  });

  it('drops the previous conversation context and cost but keeps the account limits', () => {
    const first = mergeUsageReport(withLimits(0.4, null), 'claude-acp', report({ cost: { amount: 1, currency: 'USD' } }), NOW);
    const next = mergeUsageReport(first, 'claude-acp', report({ sessionId: 's-2', context: { usedTokens: 10, windowTokens: 100 } }), NOW + 1);
    expect(next?.cost).toBeNull();
    expect(next?.context?.usedTokens).toBe(10);
    expect(next?.limits.fiveHour?.usedFraction).toBe(0.4);
  });

  it('leaves everything as it was when an update states nothing', () => {
    const first = withLimits(0.4, 0.2);
    expect(mergeUsageReport(first, 'claude-acp', report({ sessionId: 's-2' }), NOW + 1)).toBe(first);
    expect(mergeUsageReport(null, 'claude-acp', report(), NOW)).toBeNull();
  });
});

describe('the limits worth naming', () => {
  it('names nothing below 70 percent and the fullest window from there', () => {
    expect(pressingLimit(withLimits(0.69, 0.5), NOW)).toBeNull();
    expect(pressingLimit(withLimits(0.7, 0.2), NOW)).toMatchObject({ window: 'fiveHour', percent: 70, level: 'notice' });
    expect(pressingLimit(withLimits(0.72, 0.9), NOW)).toMatchObject({ window: 'weekly', percent: 90, level: 'warning' });
  });

  it('turns the warning tone at the shown 85 percent, not a hidden fraction below it', () => {
    expect(pressingLimit(withLimits(0.846, null), NOW)?.level).toBe('warning');
    expect(pressingLimit(withLimits(0.844, null), NOW)?.level).toBe('notice');
  });

  it('forgets a window once its reset has passed', () => {
    const usage = withLimits(0.95, 0.3);
    expect(limitsInForce(usage, NOW + 2 * HOUR_MS).map((limit) => limit.window)).toEqual(['weekly']);
    expect(pressingLimit(usage, NOW + 2 * HOUR_MS)).toBeNull();
  });
});
