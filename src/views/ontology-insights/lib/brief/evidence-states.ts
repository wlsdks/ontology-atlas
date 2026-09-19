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
  /** A folder path. Its change time says only that something under it moved. */
  isDir?: boolean;
  lastChangedAt: string | null;
}

/** What moved under one concept, so a screen can name the file and the date, not just a count. */
interface EvidenceRow {
  id: string;
  /** ISO time of the concept document's own newest commit, when the walk supplied one. */
  docChangedAt: string | null;
  /** Files cited by this concept that changed after the document. */
  moved: readonly { path: string; changedAt: string }[];
  /** Cited paths no longer on disk. */
  gone: readonly string[];
  /** Folder-level paths that changed: something under them moved, which is not yet a verdict. */
  folders: readonly { path: string; changedAt: string }[];
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
  /**
   * Only folder-level evidence moved. A folder changes on almost any commit, so this says
   * "something under it moved", not "the meaning stands on moved ground"; it is counted as
   * unknown and named on its own line rather than inflating stale.
   */
  folderOnly: ReadonlySet<string>;
  /** One row per concept in a non-current state, in input order. The screen names these. */
  rows: readonly EvidenceRow[];
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
  const folderOnly = new Set<string>();
  const rows: EvidenceRow[] = [];
  for (const concept of concepts) {
    if (concept.evidencePaths.length === 0 || !concept.docPath) {
      unknown.add(concept.id);
      continue;
    }
    const doc = changes.get(concept.docPath);
    const docMs = toMs(doc?.lastChangedAt ?? null);
    let verdict: 'current' | 'stale' | 'missing' | 'unknown' = 'current';
    let fileMoved = false;
    let folderMoved = false;
    const moved: { path: string; changedAt: string }[] = [];
    const folders: { path: string; changedAt: string }[] = [];
    const gone: string[] = [];
    for (const path of concept.evidencePaths) {
      const change = changes.get(path);
      if (!change) {
        verdict = 'unknown';
        break;
      }
      if (!change.exists) {
        verdict = 'missing';
        gone.push(path);
        continue;
      }
      if (docMs == null || change.lastChangedAt == null) {
        verdict = 'unknown';
        continue;
      }
      if (isAfter(change.lastChangedAt, docMs) && change.lastChangedAt) {
        if (change.isDir) {
          folderMoved = true;
          folders.push({ path, changedAt: change.lastChangedAt });
        } else {
          fileMoved = true;
          moved.push({ path, changedAt: change.lastChangedAt });
        }
      }
    }
    if (verdict === 'current' && fileMoved) verdict = 'stale';
    if (verdict === 'current') {
      if (folderMoved) {
        folderOnly.add(concept.id);
        unknown.add(concept.id);
      } else current.add(concept.id);
    } else if (verdict === 'stale') stale.add(concept.id);
    else if (verdict === 'missing') missing.add(concept.id);
    else unknown.add(concept.id);
    if (verdict !== 'current' || folderMoved) {
      rows.push({ id: concept.id, docChangedAt: doc?.lastChangedAt ?? null, moved, gone, folders });
    }
  }
  return { current, stale, missing, unknown, folderOnly, rows };
}
