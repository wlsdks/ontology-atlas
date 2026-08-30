/**
 * Parser for the LLM call audit log (`.ontology-atlas/llm-audit.jsonl`) —
 * **read-only**.
 *
 * Writing is owned by the Rust side that holds the key
 * (`src-tauri/src/llm_audit.rs`). The web does not write for the same reason as
 * `activity.jsonl`: when whoever owns the record is whoever owns the
 * transmission, "a transmission with no record" becomes structurally impossible.
 *
 * Line schema v1:
 * `{"v":1,"at","provider","host","model","purpose","question","scope":{"nodes","promptChars","vaultChars"},"payloadSha256","outcome","httpStatus","responseChars","durationMs"}`
 *
 * - `host` was **added later**, which is why `v` is still 1. Older lines without
 *   it already sit on user disks, so they read as `null` — stating plainly that
 *   the destination is unknown rather than guessing it from the provider name.
 *   Charter clause ⑤ is that records are never rewritten after the fact, and a
 *   parser absorbing the absence is that promise's code-side face.
 * - A reserved line is written to disk **just before** transmission, without the
 *   outcome fields. If the process dies before the response that line stays, so a
 *   line with no outcome fields reads as `outcome: 'unknown'` — a missing fact is
 *   not invented as a success or a failure.
 * - Broken lines are skipped (a parser dying and showing nothing is worse).
 * - Response bodies are never recorded, only their length — this is not a
 *   conversation store.
 *
 * Drift between the Rust writer and this reader is caught by a contract test
 * that runs both against the shared fixture
 * `tests/fixtures/llm-audit-log.sample.jsonl`.
 */

type LlmAuditOutcome = 'ok' | 'denied' | 'error' | 'unknown';

interface LlmAuditScope {
  /** Slugs of the nodes whose excerpts were sent; empty for a connection check. */
  nodes: string[];
  promptChars: number;
  vaultChars: number;
}

/** Tool calls carried by one round trip — name and target only; full arguments are never recorded. */
interface LlmAuditToolRef {
  name: string;
  target: string;
}

export interface LlmAuditEntry {
  v: 1;
  at: string;
  provider: string;
  /**
   * The host the request actually went to. Lines from before `host` existed read
   * as `null` — a missing fact is not invented from the provider name.
   */
  host: string | null;
  model: string | null;
  /** `'verify' | 'agent'` — the parser passes future values through unchanged. */
  purpose: string;
  /** The user's own words; `null` for a connection check. */
  question: string | null;
  scope: LlmAuditScope;
  /**
   * Tool calls carried by this round trip. A line **without** the field reads as
   * `null`, which means something different from an empty array ("used 0 tools").
   * Connection-check lines never carry this field.
   */
  tools: LlmAuditToolRef[] | null;
  payloadSha256: string;
  outcome: LlmAuditOutcome;
  /** Values that may still be unknown are `null`, not 0 — 0 would assert a fact. */
  httpStatus: number | null;
  responseChars: number | null;
  durationMs: number | null;
}

const KNOWN_OUTCOMES: readonly LlmAuditOutcome[] = ['ok', 'denied', 'error'];

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readScope(value: unknown): LlmAuditScope {
  const raw = (value ?? {}) as Partial<LlmAuditScope>;
  return {
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.filter((node): node is string => typeof node === 'string')
      : [],
    promptChars: readNumber(raw.promptChars) ?? 0,
    vaultChars: readNumber(raw.vaultChars) ?? 0,
  };
}

function readTools(value: unknown): LlmAuditToolRef[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((row) => {
    const raw = row as Partial<LlmAuditToolRef> | null;
    if (!raw || typeof raw.name !== 'string') return [];
    return [{ name: raw.name, target: typeof raw.target === 'string' ? raw.target : '' }];
  });
}

export function parseLlmAuditLog(
  raw: string,
  { limit = 50 }: { limit?: number } = {},
): LlmAuditEntry[] {
  const entries: LlmAuditEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed?.v !== 1) continue;
      if (typeof parsed.at !== 'string' || typeof parsed.provider !== 'string') continue;
      const outcome = parsed.outcome;
      entries.push({
        v: 1,
        at: parsed.at,
        provider: parsed.provider,
        host: typeof parsed.host === 'string' && parsed.host ? parsed.host : null,
        model: typeof parsed.model === 'string' ? parsed.model : null,
        purpose: typeof parsed.purpose === 'string' ? parsed.purpose : '',
        question: typeof parsed.question === 'string' ? parsed.question : null,
        scope: readScope(parsed.scope),
        tools: readTools(parsed.tools),
        payloadSha256:
          typeof parsed.payloadSha256 === 'string' ? parsed.payloadSha256 : '',
        outcome:
          typeof outcome === 'string' && KNOWN_OUTCOMES.includes(outcome as LlmAuditOutcome)
            ? (outcome as LlmAuditOutcome)
            : 'unknown',
        httpStatus: readNumber(parsed.httpStatus),
        responseChars: readNumber(parsed.responseChars),
        durationMs: readNumber(parsed.durationMs),
      });
    } catch {
      /* skip broken line */
    }
  }
  return entries.slice(-limit);
}

export const LLM_AUDIT_LOG_RELATIVE_PATH = '.ontology-atlas/llm-audit.jsonl';

/**
 * Reads the tail of the audit log from the vault folder. A missing file returns
 * an empty array: its absence is itself the fact "nothing has been sent yet", so
 * it is not an error.
 */
export async function readLlmAuditLog(
  handle: FileSystemDirectoryHandle,
  { limit = 10 }: { limit?: number } = {},
): Promise<LlmAuditEntry[]> {
  try {
    const dir = await handle.getDirectoryHandle('.ontology-atlas');
    const file = await dir.getFileHandle('llm-audit.jsonl');
    const raw = await (await file.getFile()).text();
    return parseLlmAuditLog(raw, { limit });
  } catch {
    return [];
  }
}
