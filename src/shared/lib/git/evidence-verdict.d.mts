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
  /** The commit that dates the document, the revision `unchangedPairs` was read at. */
  docCommit?: string | null;
  /** Pairs from `unchangedEvidencePairs`: files that changed only in comments, import paths or layout. */
  unchangedPairs?: ReadonlySet<string> | null;
  entries: readonly EvidenceEntry[];
}): EvidenceVerdict;

export interface EvidenceTextPair {
  commit: string;
  path: string;
}

/** How many pairs one read asks for; every surface reads the sorted pairs in chunks of this size. */
export const EVIDENCE_TEXT_CHUNK: number;

/** Moved pairs sorted by path then commit, hidden and credential-named paths left out. */
export function movedEvidencePairs(
  concepts: readonly { docPath: string | null; evidencePaths: readonly string[] }[],
  changes: ReadonlyMap<string, EvidencePathChange & { lastCommit?: string | null }>,
  sourceChanges?: ReadonlyMap<string, EvidencePathChange>,
): EvidenceTextPair[];

export function unchangedEvidencePairs(
  readings: readonly (EvidenceTextPair & { before: string | null | undefined; after: string | null | undefined })[],
): Set<string>;
