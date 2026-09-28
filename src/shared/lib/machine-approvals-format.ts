/** The stored shape of `machine-approvals.ts`, apart so the e2e bridge can seed it without React. */

export const MACHINE_APPROVALS_STORAGE_KEY = 'ontology-atlas:machine-approvals';
const VERSION = 1;

export type ApprovalSubject = 'connector' | 'round';
const SUBJECTS: readonly ApprovalSubject[] = ['connector', 'round'];

/** `[subject, absolute folder, id, the definition allowed]`. */
export type ApprovalEntry = readonly [ApprovalSubject, string, string, string];

export function serializeApprovals(entries: readonly ApprovalEntry[]): string {
  return JSON.stringify({ v: VERSION, allowed: entries });
}

export function parseApprovals(raw: string | null): ApprovalEntry[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as { v?: unknown; allowed?: unknown };
  if (record.v !== VERSION || !Array.isArray(record.allowed)) return [];
  const entries: ApprovalEntry[] = [];
  for (const item of record.allowed) {
    if (!Array.isArray(item) || item.length !== 4) continue;
    const [subject, folder, id, fingerprint] = item as unknown[];
    if (!SUBJECTS.includes(subject as ApprovalSubject)) continue;
    if (typeof folder !== 'string' || !folder || typeof id !== 'string' || !id) continue;
    if (typeof fingerprint !== 'string') continue;
    entries.push([subject as ApprovalSubject, folder, id, fingerprint]);
  }
  return entries;
}
