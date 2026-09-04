/**
 * **How much a tool call actually returned** — the missing half of a tool line.
 *
 * ## Why (2026-09-05)
 *
 * A tool line that says only 「Read the map · domains/agent-integration」 tells you the
 * agent looked; it does not tell you what came back. When the answer above it is wrong,
 * that line cannot say whether the tool found nothing, found one thing, or found forty —
 * so a wrong answer stays undiagnosable and the only remedy is to ask again and hope.
 *
 * A count makes the same line diagnostic: 「found 0」 under a confident paragraph is a
 * visible contradiction, and a person can act on it without reading a transcript dump.
 *
 * ## It counts only what the tool itself counted
 *
 * The count is read from the tool's **own** top-level `total` or `count` field and from
 * nowhere else. Measured against the live server: `list_concepts({kind:'domain',limit:1})`
 * answers `{"total":8,"nodes":[…],"returned":1,"limited":true,"pagination":{…}}`, and
 * `mcp/src/index.js` returns every result through `ok()` as one text block holding
 * `JSON.stringify(result, null, 2)`.
 *
 * Three refusals keep the line from lying:
 *
 * - **No nesting.** `pagination.total` is not read. A number found by digging belongs to
 *   some inner object whose meaning this module does not know.
 * - **No array lengths.** `get_concept` returns a node whose `capabilities:` array has a
 *   length, and that length is not a result count.
 * - **No count on a call that did not finish well.** `failed` and `cancelled` describe an
 *   answer nobody received; printing a number beside them would describe work that never
 *   landed.
 *
 * When none of that yields a number the line falls back to the status the tool reported,
 * which is always true and never invented.
 */

/** Statuses the ACP adapter uses once a tool call is over. */
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export type ToolOutcome =
  | { kind: 'count'; count: number }
  /** `running` covers every status before the call is over — `pending`, `in_progress`, and any newer name. */
  | { kind: 'status'; status: 'running' | 'done' | 'failed' | 'cancelled' };

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

export function readToolOutcome(rawOutput: unknown, status: string): ToolOutcome {
  if (!TERMINAL.has(status)) return { kind: 'status', status: 'running' };
  if (status === 'failed') return { kind: 'status', status: 'failed' };
  if (status === 'cancelled') return { kind: 'status', status: 'cancelled' };

  const result = resultObject(rawOutput);
  if (result) {
    for (const key of COUNT_KEYS) {
      const value = result[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return { kind: 'count', count: value };
      }
    }
  }
  return { kind: 'status', status: 'done' };
}
