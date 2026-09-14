const TASK_BASELINE_MAX_DOCUMENTS = 1_000;
export const TASK_BASELINE_MAX_DOCUMENT_BYTES = 500_000;
const TASK_BASELINE_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export type TaskBaselineUnavailableReason =
  | 'empty_scope'
  | 'scope_too_large'
  | 'document_missing'
  | 'document_too_large'
  | 'total_too_large'
  | 'read_failed'
  | 'capture_failed'
  | 'document_changed_during_capture'
  | 'membership_changed'
  | 'context_changed';

export interface TaskBaselineSourceInspection {
  rootPath: string;
  sourceId: string;
  kind: 'git' | 'folder';
  revision: string;
  fingerprint: string;
  dirty: boolean | null;
  truncated: boolean;
  files: readonly string[];
}

interface TaskBaselineSourceBasis {
  kind: 'git' | 'folder';
  revision: string;
  fingerprint: string;
  dirty: boolean | null;
  rootPath: string;
  sourceId: string;
  files: readonly string[];
  scope: 'project-source-inspection';
  sourceBasisId: string;
}

interface TaskBaselineDocument {
  slug: string;
  raw: string;
  mtime: number;
  contentDigest: string;
}

interface TaskBaselineCommon {
  capturedAt: string;
  vaultId: string;
  scope: { requestedSlugs: readonly string[]; capturedSlugs: readonly string[] };
  counts: { requested: number; captured: number; bytes: number };
  sourceUnavailableReasons: readonly ('missing' | 'read_failed' | 'truncated' | 'changed_during_capture')[];
}

export type TaskBaselineCaptureResult =
  | (TaskBaselineCommon & {
      status: 'available';
      documents: readonly TaskBaselineDocument[];
      meaningBasis: string;
      sourceBasis: TaskBaselineSourceBasis | null;
    })
  | (TaskBaselineCommon & {
      status: 'unavailable';
      reasons: readonly TaskBaselineUnavailableReason[];
      documents: readonly [];
      meaningBasis: null;
      sourceBasis: null;
    });

export interface TaskBaselineCaptureRequest {
  vaultId: string;
  slugs: readonly string[];
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  /** Rechecks the captured vault, task, generation and requested membership after each await. */
  isCurrent: () => boolean;
  inspectSource?: () => Promise<TaskBaselineSourceInspection | null>;
  now?: () => string;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function unavailableTaskBaseline(
  capturedAt: string,
  vaultId: string,
  requestedSlugs: readonly string[],
  reasons: readonly TaskBaselineUnavailableReason[],
  progress: { captured: number; bytes: number } = { captured: 0, bytes: 0 },
): TaskBaselineCaptureResult {
  return deepFreeze({
    status: 'unavailable' as const,
    capturedAt,
    vaultId,
    scope: { requestedSlugs: [...requestedSlugs], capturedSlugs: requestedSlugs.slice(0, progress.captured) },
    counts: { requested: requestedSlugs.length, captured: progress.captured, bytes: progress.bytes },
    sourceUnavailableReasons: [],
    reasons: [...new Set(reasons)],
    documents: [] as [],
    meaningBasis: null,
    sourceBasis: null,
  });
}

/**
 * Reads the explicitly requested ontology documents before the actor starts. Two complete reads
 * bracket hashing so equal mtimes cannot hide bytes changed during capture. Nothing here is sent
 * to the actor or persisted; the caller decides which later permission may inspect the snapshot.
 */
export async function captureTaskBaseline(request: TaskBaselineCaptureRequest): Promise<TaskBaselineCaptureResult> {
  const capturedAt = (request.now ?? (() => new Date().toISOString()))();
  const slugs = [...new Set(request.slugs.map((slug) => slug.trim()).filter(Boolean))].sort();
  if (slugs.length === 0) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['empty_scope']);
  if (slugs.length > TASK_BASELINE_MAX_DOCUMENTS) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['scope_too_large']);
  if (!request.isCurrent()) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['context_changed']);

  const handles = slugs.map((slug) => request.fileHandles.get(slug) ?? null);
  if (handles.some((handle) => handle === null)) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['document_missing']);

  const readPass = async (): Promise<
    | { status: 'complete'; rows: Array<{ raw: string; mtime: number; size: number; digest: string }>; bytes: number }
    | { status: 'failed'; reason: TaskBaselineUnavailableReason; captured: number; bytes: number }
  > => {
    const rows: Array<{ raw: string; mtime: number; size: number; digest: string }> = [];
    let total = 0;
    for (const handle of handles) {
      try {
        const file = await handle!.getFile();
        if (!request.isCurrent()) return { status: 'failed', reason: 'context_changed', captured: rows.length, bytes: total };
        if (file.size > TASK_BASELINE_MAX_DOCUMENT_BYTES) return { status: 'failed', reason: 'document_too_large', captured: rows.length, bytes: total };
        total += file.size;
        if (total > TASK_BASELINE_MAX_TOTAL_BYTES) return { status: 'failed', reason: 'total_too_large', captured: rows.length, bytes: total - file.size };
        const raw = await file.text();
        if (!request.isCurrent()) return { status: 'failed', reason: 'context_changed', captured: rows.length, bytes: total - file.size };
        rows.push({ raw, mtime: file.lastModified, size: file.size, digest: await sha256(raw) });
        if (!request.isCurrent()) return { status: 'failed', reason: 'context_changed', captured: rows.length, bytes: total };
      } catch {
        return { status: 'failed', reason: 'read_failed', captured: rows.length, bytes: total };
      }
    }
    return { status: 'complete', rows, bytes: total };
  };

  let firstSource: TaskBaselineSourceInspection | null = null;
  let sourceReadFailed = false;
  if (request.inspectSource) {
    try { firstSource = await request.inspectSource(); } catch { sourceReadFailed = true; }
    if (!request.isCurrent()) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['context_changed']);
  }

  const first = await readPass();
  if (first.status === 'failed') return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, [first.reason], first);
  if (slugs.some((slug, index) => request.fileHandles.get(slug) !== handles[index])) {
    return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['membership_changed']);
  }
  const second = await readPass();
  if (second.status === 'failed') return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, [second.reason], second);
  if (slugs.some((slug, index) => request.fileHandles.get(slug) !== handles[index])) {
    return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['membership_changed']);
  }
  if (first.rows.some((row, index) => row.mtime !== second.rows[index]!.mtime || row.digest !== second.rows[index]!.digest)) {
    return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['document_changed_during_capture']);
  }

  let sourceBasis: TaskBaselineSourceBasis | null = null;
  const sourceUnavailableReasons: Array<'missing' | 'read_failed' | 'truncated' | 'changed_during_capture'> = [];
  if (request.inspectSource) {
    let secondSource: TaskBaselineSourceInspection | null = null;
    try {
      secondSource = await request.inspectSource();
      if (!request.isCurrent()) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['context_changed']);
    } catch { sourceReadFailed = true; }
    if (sourceReadFailed) sourceUnavailableReasons.push('read_failed');
    else if (!firstSource || !secondSource) sourceUnavailableReasons.push('missing');
    else if (firstSource.truncated || secondSource.truncated) sourceUnavailableReasons.push('truncated');
    else {
      const canonicalSource = (source: TaskBaselineSourceInspection) => ({
        kind: source.kind, rootPath: source.rootPath, sourceId: source.sourceId,
        revision: source.revision, fingerprint: source.fingerprint, dirty: source.dirty,
        truncated: source.truncated, files: [...source.files].sort(),
      });
      const before = canonicalSource(firstSource);
      const after = canonicalSource(secondSource);
      if (JSON.stringify(before) !== JSON.stringify(after)) sourceUnavailableReasons.push('changed_during_capture');
      else if (after.rootPath.trim() && after.sourceId.trim() && after.revision.trim() && after.fingerprint.trim()) {
        const sourceBasisId = `source:sha256:${await sha256(JSON.stringify(after))}`;
        sourceBasis = {
          kind: after.kind,
          revision: after.revision,
          fingerprint: after.fingerprint,
          dirty: after.dirty,
          rootPath: after.rootPath,
          sourceId: after.sourceId,
          files: after.files,
          scope: 'project-source-inspection',
          sourceBasisId,
        };
      }
      else sourceUnavailableReasons.push('missing');
    }
  } else {
    sourceUnavailableReasons.push('missing');
  }

  const documents = await Promise.all(first.rows.map(async (row, index) => ({
    slug: slugs[index]!, raw: row.raw, mtime: row.mtime, contentDigest: `sha256:${row.digest}`,
  })));
  const meaningDigest = await sha256(JSON.stringify(documents.map(({ slug, mtime, contentDigest }) => ({ slug, mtime, contentDigest }))));
  if (!request.isCurrent()) return unavailableTaskBaseline(capturedAt, request.vaultId, slugs, ['context_changed']);
  return deepFreeze({
    status: 'available' as const,
    capturedAt,
    vaultId: request.vaultId,
    scope: { requestedSlugs: slugs, capturedSlugs: slugs },
    counts: { requested: slugs.length, captured: documents.length, bytes: first.bytes },
    sourceUnavailableReasons,
    documents,
    meaningBasis: `meaning:sha256:${meaningDigest}`,
    sourceBasis,
  });
}
