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
  entries: readonly EvidenceEntry[];
}): EvidenceVerdict;
