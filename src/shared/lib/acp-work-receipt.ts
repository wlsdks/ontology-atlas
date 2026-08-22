/**
 * A bounded, local receipt for one human decision in the in-app ACP workbench.
 *
 * It deliberately excludes full chat transcripts, thoughts, tool output, and absolute
 * paths. The vault already owns execution facts in activity.jsonl; this record closes
 * the missing human-decision boundary: request -> reviewed shape -> allow/reject -> result.
 */
export const ACP_WORK_RECEIPT_DIR = '.ontology-atlas';
export const ACP_WORK_RECEIPT_FILE = 'acp-work.jsonl';
const MAX_RECEIPTS = 50;
const MAX_SNAPSHOTS = 200;

export type AcpWorkDecision = 'allowed' | 'rejected';
export type AcpWorkResult = 'pending' | 'completed' | 'failed' | 'cancelled' | 'not-run';

export interface AcpWorkReceiptItem {
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
      if (receipt) latest.set(receipt.id, receipt);
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
