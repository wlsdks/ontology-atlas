/**
 * A bounded, local receipt for one human decision in the in-app ACP workbench.
 *
 * It deliberately excludes full chat transcripts, thoughts, tool output, and absolute
 * paths. The vault already owns execution facts in activity.jsonl; this record closes
 * the missing human-decision boundary: request -> reviewed shape -> allow/reject -> result.
 */
const ACP_WORK_RECEIPT_DIR = '.ontology-atlas';
export const ACP_WORK_RECEIPT_FILE = 'acp-work.jsonl';
const MAX_RECEIPTS = 50;
const MAX_SNAPSHOTS = 200;

export type AcpWorkDecision = 'allowed' | 'rejected';
export type AcpWorkResult = 'pending' | 'completed' | 'failed' | 'cancelled' | 'not-run';
interface AcpWorkReceiptOrigin {
  vaultId: string;
  sessionGeneration: number;
  sessionId: string;
  userEventId: string;
  requestId: string | number;
  toolCallId: string;
}
interface AcpWriterCorrelation {
  status: 'verified';
  server: string;
  tool: string;
  toolCall: 'structured-mcp';
  approval: 'structured-mcp';
  terminal: 'not-observed' | 'pending' | 'completed' | 'failed' | 'cancelled';
}

interface AcpWorkReceiptItem {
  target: string | null;
  operation: string;
  relation: { from: string; type: string; to: string } | null;
  /** Field names only: values may contain long document bodies and do not belong here. */
  fields: string[];
}

export interface AcpWorkReceipt {
  v: 1;
  /** Stable across the pending and terminal snapshots of the same tool call. */
  id: string;
  at: string;
  updatedAt: string;
  agent: string;
  /** The user's bounded request summary, never the agent's thought or full transcript. */
  request: string;
  tool: string;
  decision: AcpWorkDecision;
  result: AcpWorkResult;
  items: AcpWorkReceiptItem[];
  /** Absent on legacy rows. Presence means every field must validate; malformed data is not legacy. */
  origin?: AcpWorkReceiptOrigin;
  writerCorrelation?: AcpWriterCorrelation;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readItem(value: unknown): AcpWorkReceiptItem | null {
  const row = record(value);
  if (!row || (typeof row.target !== 'string' && row.target !== null)) return null;
  if (typeof row.operation !== 'string' || !Array.isArray(row.fields)) return null;
  const fields = row.fields.filter((field): field is string => typeof field === 'string').slice(0, 32);
  const rawRelation = record(row.relation);
  const relation = rawRelation
    && typeof rawRelation.from === 'string'
    && typeof rawRelation.type === 'string'
    && typeof rawRelation.to === 'string'
      ? { from: rawRelation.from, type: rawRelation.type, to: rawRelation.to }
      : null;
  return {
    target: typeof row.target === 'string' ? row.target : null,
    operation: row.operation,
    relation,
    fields,
  };
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readOrigin(value: unknown): AcpWorkReceiptOrigin | null {
  const row = record(value);
  if (!row || !nonblank(row.vaultId) || !Number.isInteger(row.sessionGeneration) || Number(row.sessionGeneration) < 0
    || !nonblank(row.sessionId) || !nonblank(row.userEventId)
    || (typeof row.requestId !== 'string' && typeof row.requestId !== 'number')
    || !Number.isFinite(typeof row.requestId === 'number' ? row.requestId : 0)
    || !nonblank(row.toolCallId)) return null;
  return { vaultId: row.vaultId, sessionGeneration: row.sessionGeneration as number, sessionId: row.sessionId,
    userEventId: row.userEventId, requestId: row.requestId, toolCallId: row.toolCallId };
}

function readWriterCorrelation(value: unknown): AcpWriterCorrelation | null {
  const row = record(value);
  if (!row || row.status !== 'verified' || !nonblank(row.server) || !nonblank(row.tool)
    || row.toolCall !== 'structured-mcp' || row.approval !== 'structured-mcp'
    || !['not-observed', 'pending', 'completed', 'failed', 'cancelled'].includes(String(row.terminal))) return null;
  return { status: 'verified', server: row.server, tool: row.tool, toolCall: 'structured-mcp',
    approval: 'structured-mcp', terminal: row.terminal as AcpWriterCorrelation['terminal'] };
}

const DECISIONS = new Set<AcpWorkDecision>(['allowed', 'rejected']);
const RESULTS = new Set<AcpWorkResult>([
  'pending',
  'completed',
  'failed',
  'cancelled',
  'not-run',
]);

function readReceipt(value: unknown): AcpWorkReceipt | null {
  const row = record(value);
  if (
    !row
    || row.v !== 1
    || typeof row.id !== 'string'
    || typeof row.at !== 'string'
    || typeof row.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(row.at))
    || !Number.isFinite(Date.parse(row.updatedAt))
    || typeof row.agent !== 'string'
    || typeof row.request !== 'string'
    || typeof row.tool !== 'string'
    || !DECISIONS.has(row.decision as AcpWorkDecision)
    || !RESULTS.has(row.result as AcpWorkResult)
    || !Array.isArray(row.items)
  ) {
    return null;
  }
  const items = row.items.slice(0, 50).map(readItem);
  if (items.some((item) => item === null)) return null;
  const origin = row.origin === undefined ? undefined : readOrigin(row.origin);
  const writerCorrelation = row.writerCorrelation === undefined ? undefined : readWriterCorrelation(row.writerCorrelation);
  if (origin === null || writerCorrelation === null) return null;
  if (row.decision === 'rejected' ? row.result !== 'not-run' : row.result === 'not-run') return null;
  if (writerCorrelation) {
    if (!origin) return null;
    const expectedTerminal = row.result === 'not-run' ? 'not-observed' : row.result;
    if (writerCorrelation.terminal !== expectedTerminal) return null;
  }
  return {
    v: 1,
    id: row.id,
    at: row.at,
    updatedAt: row.updatedAt,
    agent: row.agent,
    request: row.request,
    tool: row.tool,
    decision: row.decision as AcpWorkDecision,
    result: row.result as AcpWorkResult,
    items: items as AcpWorkReceiptItem[],
    ...(origin ? { origin } : {}),
    ...(writerCorrelation ? { writerCorrelation } : {}),
  };
}

/**
 * JSONL contains append-only snapshots. The read model keeps the last valid
 * snapshot per decision id and returns oldest -> newest for activity surfaces.
 */
export function parseAcpWorkReceipts(
  raw: string,
  { limit = MAX_RECEIPTS }: { limit?: number } = {},
): AcpWorkReceipt[] {
  const latest = new Map<string, AcpWorkReceipt>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const receipt = readReceipt(JSON.parse(line));
      if (receipt) {
        const originKey = receipt.origin
          ? JSON.stringify([receipt.origin.vaultId, receipt.origin.sessionGeneration, receipt.origin.sessionId,
              receipt.origin.userEventId, typeof receipt.origin.requestId, receipt.origin.requestId, receipt.origin.toolCallId])
          : 'legacy';
        latest.set(`${receipt.id}:${originKey}`, receipt);
      }
    } catch {
      // One interrupted append must not hide the rest of the local history.
    }
  }
  return [...latest.values()]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-Math.max(0, limit));
}

export interface AcpWorkReceiptStore {
  append(receipt: AcpWorkReceipt): Promise<void>;
}

export function createVaultAcpWorkReceiptStore(
  handle: FileSystemDirectoryHandle,
): AcpWorkReceiptStore {
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    const next = tail.catch(() => undefined).then(operation);
    tail = next;
    return next;
  };
  return {
    append(receipt) {
      return enqueue(async () => {
        const dir = await handle.getDirectoryHandle(ACP_WORK_RECEIPT_DIR, { create: true });
        const fileHandle = await dir.getFileHandle(ACP_WORK_RECEIPT_FILE, { create: true });
        let current = '';
        try {
          current = await (await fileHandle.getFile()).text();
        } catch {
          // A just-created file has no prior snapshots.
        }
        const prior = current.split('\n').filter((line) => line.trim()).slice(-(MAX_SNAPSHOTS - 1));
        const next = [...prior, JSON.stringify(receipt)].join('\n') + '\n';
        const writable = await fileHandle.createWritable();
        await writable.write(next);
        await writable.close();
      });
    },
  };
}
