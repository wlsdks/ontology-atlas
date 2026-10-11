/**
 * How much a tool call returned. A count is read only from our vault server's top-level
 * `total` or `count`, so `fromVaultServer` is required. No nesting, no array lengths, no
 * count on a call that did not finish well; else it falls back to the reported status.
 */

/** Statuses the ACP adapter uses once a tool call is over. */
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export type ToolOutcome =
  | { kind: 'count'; count: number }
  /** `running` covers every status before the call is over — `pending`, `in_progress`, and any newer name. */
  | {
      kind: 'status';
      /**
       * `unfinished` is a call that never reached a terminal state and whose turn is over. It is
       * not a failure — nobody said it failed — it is the absence of an ending.
       */
      status: 'running' | 'done' | 'failed' | 'cancelled' | 'unfinished';
    };

/**
 * The count fields our tools report at the top level. **Order is the priority.** `total`
 * is the number of matches the tool found; `count` is the name the health and census
 * answers use for the same idea.
 */
const COUNT_KEYS = ['total', 'count'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * `rawOutput` arrives as the MCP content array (`[{type:'text',text:'…'}]`) when the call
 * went to an MCP server, and occasionally as a plain object. Both are accepted; anything
 * else yields nothing.
 */
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
      // Not JSON — an error string or plain prose. Nothing to count, and nothing invented.
      return null;
    }
  }
  return null;
}

export function readToolOutcome(
  rawOutput: unknown,
  status: string,
  /** Did this call go to the vault server we wired in? Only then is a count readable. */
  fromVaultServer: boolean,
  /**
   * Is the turn still running? Required, not defaulted, like `fromVaultServer`: the adapter
   * stops reporting without closing a call, and either default would claim work in progress
   * that stopped.
   */
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

/** A trimmed answer's preview carries this count under the same key. */
export function outputCount(rawOutput: unknown): { key: (typeof COUNT_KEYS)[number]; value: number } | null {
  const result = resultObject(rawOutput);
  if (!result) return null;
  for (const key of COUNT_KEYS) {
    const value = result[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return { key, value };
  }
  return null;
}
