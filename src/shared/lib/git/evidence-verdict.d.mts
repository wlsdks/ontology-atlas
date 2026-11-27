export interface EvidencePathChange {
  exists: boolean;
  /** A folder path: its change time says only that something under it moved. */
  isDir?: boolean;
  lastChangedAt: string | null;
}

export interface EvidenceEntry {
  path: string;
  /** What the Git walk said about this path, or `null`/absent when it never reached it. */
  change?: EvidencePathChange | null;
}

export interface EvidenceVerdict {
  verdict: 'current' | 'stale' | 'missing' | 'unknown';
  /** Why a verdict is `unknown`; `null` otherwise. */
  reason: string | null;
  moved: { path: string; changedAt: string }[];
  folders: { path: string; changedAt: string }[];
  gone: string[];
}

export function judgeEvidence(input: {
  docChangedAt: string | null | undefined;
  /** The document's newest commit, the revision `unchangedPairs` was read at. */
  docCommit?: string | null;
  /** Pairs from `unchangedEvidencePairs`: files that changed only in comments, imports or whitespace. */
  unchangedPairs?: ReadonlySet<string> | null;
  entries: readonly EvidenceEntry[];
}): EvidenceVerdict;

export interface EvidenceTextPair {
  commit: string;
  path: string;
}

export function movedEvidencePairs(
  concepts: readonly { docPath: string | null; evidencePaths: readonly string[] }[],
  changes: ReadonlyMap<string, EvidencePathChange & { lastCommit?: string | null }>,
  sourceChanges?: ReadonlyMap<string, EvidencePathChange>,
): EvidenceTextPair[];

export function unchangedEvidencePairs(
  readings: readonly (EvidenceTextPair & { before: string | null | undefined; after: string | null | undefined })[],
): Set<string>;
