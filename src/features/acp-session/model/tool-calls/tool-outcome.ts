/** How much a tool call returned. A count is read only from our vault server's top-level `total` or `count`, never nested, from array lengths, or on a call that did not finish well. */

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export type ToolOutcome =
  | { kind: 'count'; count: number }
  /** `running` covers every status before the call is over — `pending`, `in_progress`, and any newer name. */
  | {
      kind: 'status';
      /** `unfinished`: never reached a terminal state and its turn is over; not a failure, the absence of an ending. */
      status: 'running' | 'done' | 'failed' | 'cancelled' | 'unfinished';
    };

/** Order is the priority: `total` is the match count; `count` is the name health and census answers use for the same idea. */
const COUNT_KEYS = ['total', 'count'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `rawOutput` is the MCP content array `[{type:'text',text:'…'}]` or occasionally a plain object; anything else yields nothing. */
function resultObject(rawOutput: unknown): Record<string, unknown> | null {
  const direct = asRecord(rawOutput);
  if (direct) return direct;
  if (!Array.isArray(rawOutput)) return null;
  for (const block of rawOutput) {
    const record = asRecord(block);
    if (!record || record.type !== 'text') continue;
    const text = record.text;
    if (typeof text !== 'string') continue;
    try {
      return asRecord(JSON.parse(text));
    } catch {
      return null;
    }
  }
  return null;
}

export function readToolOutcome(
  rawOutput: unknown,
  status: string,
  fromVaultServer: boolean,
  /** Required, not defaulted, like `fromVaultServer`: the adapter stops reporting without closing a call, and a default would claim work that stopped. */
  turnRunning: boolean,
): ToolOutcome {
  if (!TERMINAL.has(status)) {
    return { kind: 'status', status: turnRunning ? 'running' : 'unfinished' };
  }
  if (status === 'failed') return { kind: 'status', status: 'failed' };
  if (status === 'cancelled') return { kind: 'status', status: 'cancelled' };

  const count = fromVaultServer ? outputCount(rawOutput) : null;
  return count ? { kind: 'count', count: count.value } : { kind: 'status', status: 'done' };
}

export function outputCount(rawOutput: unknown): { key: (typeof COUNT_KEYS)[number]; value: number } | null {
  const result = resultObject(rawOutput);
  if (!result) return null;
  for (const key of COUNT_KEYS) {
    const value = result[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return { key, value };
  }
  return null;
}
