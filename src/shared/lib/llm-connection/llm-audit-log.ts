import { openTauriAuditSource } from '../vault-folder/native-vault/tauri-audit-source';

/**
 * Read-only: Rust writes the log (`src-tauri/src/llm_audit.rs`) because whoever owns a
 * transmission must own its record. A line written just before sending with no outcome reads
 * `unknown`; broken lines are skipped. `tests/fixtures/llm-audit-log.sample.jsonl` keeps the
 * writer and this reader in step.
 */

/**
 * `open` is a run's start line with no closing line in view: still running, or
 * stopped before it could close. It is not invented as a success or a failure.
 */
type LlmAuditOutcome = 'ok' | 'denied' | 'error' | 'unknown' | 'open';

/**
 * Long sends (search by meaning preparing a folder, a model download) write one
 * line before the first request and a closing line with the same `run`.
 */
interface LlmAuditRun {
  run: string;
  phase: 'start' | 'close';
  ended: string | null;
}

export interface LlmAuditEmbedRun extends LlmAuditRun {
  filesPlanned: number;
  passagesPlanned: number;
  charsPlanned: number;
  passagesSent: number;
  charsSent: number;
}

export interface LlmAuditDownload extends LlmAuditRun {
  source: string;
  revision: string | null;
  bytes: number | null;
}

interface LlmAuditScope {
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
  /** `null` on lines older than the field; never guessed from the provider name. */
  host: string | null;
  model: string | null;
  /**
   * `'verify' | 'agent' | 'judgment' | 'embed-build' | 'embed-query' | 'model-download'`;
   * the parser passes future values through unchanged.
   */
  purpose: string;
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
  embed: LlmAuditEmbedRun | null;
  download: LlmAuditDownload | null;
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

function readRun(value: unknown): LlmAuditRun | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.run !== 'string') return null;
  if (raw.phase !== 'start' && raw.phase !== 'close') return null;
  return { run: raw.run, phase: raw.phase, ended: typeof raw.ended === 'string' ? raw.ended : null };
}

function readEmbed(value: unknown): LlmAuditEmbedRun | null {
  const run = readRun(value);
  if (!run) return null;
  const raw = value as Record<string, unknown>;
  return {
    ...run,
    filesPlanned: readNumber(raw.filesPlanned) ?? 0,
    passagesPlanned: readNumber(raw.passagesPlanned) ?? 0,
    charsPlanned: readNumber(raw.charsPlanned) ?? 0,
    passagesSent: readNumber(raw.passagesSent) ?? 0,
    charsSent: readNumber(raw.charsSent) ?? 0,
  };
}

function readDownload(value: unknown): LlmAuditDownload | null {
  const run = readRun(value);
  if (!run) return null;
  const raw = value as Record<string, unknown>;
  return {
    ...run,
    source: typeof raw.source === 'string' ? raw.source : '',
    revision: typeof raw.revision === 'string' ? raw.revision : null,
    bytes: readNumber(raw.bytes),
  };
}

type AuditRecord = Record<string, unknown> & { v: 1; at: string; provider: string };

function isClosingLine(parsed: AuditRecord): boolean {
  return (
    (parsed.embed as { phase?: unknown } | undefined)?.phase === 'close' ||
    (parsed.download as { phase?: unknown } | undefined)?.phase === 'close'
  );
}

/**
 * Shows a run once: a start line whose closing line is also in view is folded into
 * the closing line, which states what was sent and how it ended.
 */
function pairRuns(entries: LlmAuditEntry[]): LlmAuditEntry[] {
  const closed = new Set<string>();
  for (const entry of entries) {
    const run = entry.embed ?? entry.download;
    if (run?.phase === 'close') closed.add(run.run);
  }
  return entries.filter((entry) => {
    const run = entry.embed ?? entry.download;
    return !(run?.phase === 'start' && closed.has(run.run));
  });
}

function parseRecord(line: string): AuditRecord | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed?.v === 1 && typeof parsed.at === 'string' && typeof parsed.provider === 'string' ? parsed as AuditRecord : null;
  } catch { return null; }
}

function toEntry(parsed: AuditRecord): LlmAuditEntry {
  const outcome = parsed.outcome;
  const embed = readEmbed(parsed.embed);
  const download = readDownload(parsed.download);
  const opensRun = (embed ?? download)?.phase === 'start';
  return {
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
        : opensRun
          ? 'open'
          : 'unknown',
    httpStatus: readNumber(parsed.httpStatus),
    responseChars: readNumber(parsed.responseChars),
    durationMs: readNumber(parsed.durationMs),
    embed,
    download,
  };
}

export function parseLlmAuditLog(
  raw: string,
  { limit = 50 }: { limit?: number } = {},
): LlmAuditEntry[] {
  const entries: LlmAuditEntry[] = [];
  for (const line of raw.split('\n')) {
    const parsed = parseRecord(line);
    if (parsed) {
      try { entries.push(toEntry(parsed)); } catch { /* skip unreadable fields */ }
    }
  }
  return pairRuns(entries).slice(-limit);
}

export const LLM_AUDIT_LOG_RELATIVE_PATH = '.ontology-atlas/llm-audit.jsonl';

export type AuditReadFailure = 'changed' | 'expired' | 'failed';
export class AuditReadError extends Error {
  readonly reason: AuditReadFailure;
  constructor(reason: AuditReadFailure) {
    super(`audit-read-${reason}`);
    this.reason = reason;
  }
}

export interface LlmAuditSummary {
  total: number;
  entries: LlmAuditEntry[];
}

const DECODE_CHUNK_BYTES = 64 * 1024;
const WORK_SLICE_MS = 4;

function yieldToHost(): Promise<void> {
  return new Promise(resolve => {
    if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close(); channel.port2.close(); resolve();
    };
    channel.port2.postMessage(null);
  });
}

class SummaryCollector {
  private total = 0;
  private next = 0;
  private entries: (AuditRecord | LlmAuditEntry)[] = [];
  private projected: boolean[] = [];
  private pending = '';
  private readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  private line(line: string) {
    const parsed = parseRecord(line);
    if (!parsed) return;
    // A run's closing line belongs to a transfer its start line already counted.
    if (!isClosingLine(parsed)) this.total++;
    if (this.limit === 0) return;
    this.entries[this.next] = line.length > DECODE_CHUNK_BYTES ? toEntry(parsed) : parsed;
    this.projected[this.next] = line.length > DECODE_CHUNK_BYTES;
    this.next = (this.next + 1) % this.limit;
  }
  private projectTail() {
    for (let i = 0; i < this.entries.length; i++) {
      if (!this.projected[i]) {
        this.entries[i] = toEntry(this.entries[i] as AuditRecord);
        this.projected[i] = true;
      }
    }
  }
  push(chunk: string) {
    let start = 0;
    for (let end = chunk.indexOf('\n'); end !== -1; end = chunk.indexOf('\n', start)) {
      this.line(this.pending + chunk.slice(start, end));
      this.pending = '';
      start = end + 1;
    }
    this.pending += chunk.slice(start);
    this.projectTail();
  }
  finish(): LlmAuditSummary {
    this.line(this.pending);
    this.pending = '';
    this.projectTail();
    const entries = this.total >= this.limit
      ? [...this.entries.slice(this.next), ...this.entries.slice(0, this.next)]
      : this.entries;
    return { total: this.total, entries: pairRuns(entries as LlmAuditEntry[]) };
  }
}

/** Counts valid records while retaining only the requested tail. */
export async function readLlmAuditSummary(
  handle: FileSystemDirectoryHandle,
  { limit = 10, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<LlmAuditSummary> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('Audit tail limit must be a nonnegative safe integer');
  const empty = (): LlmAuditSummary => ({ total: 0, entries: [] });
  if (signal?.aborted) return empty();
  let native: Awaited<ReturnType<typeof openTauriAuditSource>> = null;
  try {
    native = await openTauriAuditSource(handle, signal);
    if (native?.missing) return empty();
    let file: File | null = null;
    if (!native) {
      const directory = await handle.getDirectoryHandle('.ontology-atlas');
      if (signal?.aborted) return empty();
      const fileHandle = await directory.getFileHandle('llm-audit.jsonl');
      if (signal?.aborted) return empty();
      file = await fileHandle.getFile();
    }
    if (signal?.aborted) return empty();
    const collector = new SummaryCollector(limit);
    if (file && typeof file.stream !== 'function') {
      const raw = await file.text();
      if (signal?.aborted) return empty();
      let sliceStart = performance.now();
      for (let offset = 0; offset < raw.length; offset += DECODE_CHUNK_BYTES) {
        if (signal?.aborted) return empty();
        collector.push(raw.slice(offset, offset + DECODE_CHUNK_BYTES));
        if (performance.now() - sliceStart >= WORK_SLICE_MS) { await yieldToHost(); sliceStart = performance.now(); }
      }
      return collector.finish();
    }
    const reader = (native?.stream ?? file!.stream()).getReader();
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const decoder = new TextDecoder();
    let sliceStart = performance.now();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal?.aborted) return empty();
        if (done) break;
        for (let offset = 0; offset < value.byteLength; offset += DECODE_CHUNK_BYTES) {
          if (signal?.aborted) return empty();
          collector.push(decoder.decode(value.subarray(offset, offset + DECODE_CHUNK_BYTES), { stream: true }));
          if (performance.now() - sliceStart >= WORK_SLICE_MS) {
            await yieldToHost();
            sliceStart = performance.now();
          }
        }
      }
      collector.push(decoder.decode());
      await native?.finish();
      return collector.finish();
    } finally {
      signal?.removeEventListener('abort', abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return empty();
    if (!native && error instanceof DOMException && error.name === 'NotFoundError') return empty();
    const message = String(error);
    throw new AuditReadError(message.includes('audit-read-changed') ? 'changed' : message.includes('audit-read-expired') ? 'expired' : 'failed');
  } finally { await native?.cancel(); }
}
