import type { ContextFigures, CostFigures, LimitFigures, LimitWindow, UsageReport } from '@/entities/agent-usage';

/**
 * Reads ACP `usage_update`: `used` and `size` from every adapter, a session `cost` at a turn's
 * end, and Claude's `_meta["_claude/rateLimit"]` (the Agent SDK's `SDKRateLimitInfo`). Each part
 * stands alone: one that fails its check is left out and the rest still count.
 */
export function readUsageUpdate(update: Record<string, unknown>, sessionId: string): UsageReport | null {
  if (update.sessionUpdate !== 'usage_update') return null;
  const meta = isRecord(update._meta) ? update._meta : null;
  return {
    sessionId,
    context: readContext(update.used, update.size),
    cost: readCost(update.cost),
    limits: readRateLimit(meta?.['_claude/rateLimit']),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function readContext(used: unknown, size: unknown): ContextFigures | null {
  if (!isCount(used) || !isCount(size) || size === 0) return null;
  return { usedTokens: used, windowTokens: size };
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

function readCost(cost: unknown): CostFigures | null {
  if (!isRecord(cost) || !isCount(cost.amount)) return null;
  if (typeof cost.currency !== 'string' || !CURRENCY_CODE.test(cost.currency)) return null;
  return { amount: cost.amount, currency: cost.currency };
}

/**
 * Claude Code states utilization as a fraction of the window that "legitimately" runs past 1;
 * ten windows over is no reading but a different scale, so it is refused.
 */
const MAX_UTILIZATION = 10;
/** `resetsAt` is Unix seconds; a value this large is milliseconds or worse, a different scale. */
const MAX_RESET_SECONDS = 1e11;

function readWindow(value: unknown): LimitFigures | null {
  if (!isRecord(value)) return null;
  const { utilization, resetsAt } = value;
  if (!isCount(utilization) || utilization > MAX_UTILIZATION) return null;
  if (typeof resetsAt !== 'number' || !Number.isInteger(resetsAt) || resetsAt <= 0 || resetsAt >= MAX_RESET_SECONDS) return null;
  return { usedFraction: utilization, resetsAtMs: resetsAt * 1_000 };
}

const WINDOW_OF_RATE_LIMIT_TYPE: Readonly<Record<string, LimitWindow>> = {
  five_hour: 'fiveHour',
  seven_day: 'weekly',
};

/**
 * `unifiedWindows` tracks every window on every observation; the top-level fields describe only
 * the window limiting now, so they fill a window `unifiedWindows` did not state.
 */
function readRateLimit(info: unknown): UsageReport['limits'] {
  if (!isRecord(info)) return {};
  const limits: UsageReport['limits'] = {};
  const windows = isRecord(info.unifiedWindows) ? info.unifiedWindows : {};
  for (const [type, window] of Object.entries(WINDOW_OF_RATE_LIMIT_TYPE)) {
    const figures = readWindow(windows[type]);
    if (figures) limits[window] = figures;
  }
  const { rateLimitType } = info;
  const limiting = typeof rateLimitType === 'string' && Object.hasOwn(WINDOW_OF_RATE_LIMIT_TYPE, rateLimitType)
    ? WINDOW_OF_RATE_LIMIT_TYPE[rateLimitType]
    : undefined;
  if (limiting && !limits[limiting]) {
    const figures = readWindow(info);
    if (figures) limits[limiting] = figures;
  }
  return limits;
}
