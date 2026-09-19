import { isAfter, toMs } from './brief-model';

/** One concept and where its evidence lives, as the resolver needs it. */
export interface EvidenceConceptInput {
  id: string;
  /** Vault-relative path of the concept's own document (`capabilities/pay.md`). */
  docPath: string | null;
  /** Repository-relative implementation paths: its own `path:` plus its elements' paths. */
  evidencePaths: readonly string[];
}

export interface EvidenceChange {
  exists: boolean;
  lastChangedAt: string | null;
}

export interface EvidenceStates {
  /** Every evidence path exists and none changed after the concept's document did. */
  current: ReadonlySet<string>;
  /** Some evidence path changed after the document did: the meaning stands on moved ground. */
  stale: ReadonlySet<string>;
  /** Some evidence path is no longer on disk. */
  missing: ReadonlySet<string>;
  /** No evidence recorded, or a change time the walk could not supply. */
  unknown: ReadonlySet<string>;
}

/**
 * Compare each concept's document with the code it cites. This is the line the cognitive-diff
 * experiment (2026-09-13) found worth the most — "meaning unchanged, files underneath moved" —
 * stated per concept from Git alone. A missing time is `unknown`, never `current`.
 */
export function resolveEvidenceStates(
  concepts: readonly EvidenceConceptInput[],
  changes: ReadonlyMap<string, EvidenceChange>,
): EvidenceStates {
  const current = new Set<string>();
  const stale = new Set<string>();
  const missing = new Set<string>();
  const unknown = new Set<string>();
  for (const concept of concepts) {
    if (concept.evidencePaths.length === 0 || !concept.docPath) {
      unknown.add(concept.id);
      continue;
    }
    const doc = changes.get(concept.docPath);
    const docMs = toMs(doc?.lastChangedAt ?? null);
    let verdict: 'current' | 'stale' | 'missing' | 'unknown' = 'current';
    for (const path of concept.evidencePaths) {
      const change = changes.get(path);
      if (!change) {
        verdict = 'unknown';
        break;
      }
      if (!change.exists) {
        verdict = 'missing';
        break;
      }
      if (docMs == null || change.lastChangedAt == null) {
        verdict = 'unknown';
        continue;
      }
      if (isAfter(change.lastChangedAt, docMs)) verdict = 'stale';
    }
    if (verdict === 'current') current.add(concept.id);
    else if (verdict === 'stale') stale.add(concept.id);
    else if (verdict === 'missing') missing.add(concept.id);
    else unknown.add(concept.id);
  }
  return { current, stale, missing, unknown };
}
