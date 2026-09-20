import { judgeEvidence } from '@/shared/lib/evidence-verdict.mjs';

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
export interface EvidenceRow {
  id: string;
  /**
   * The concept's own verdict, carried so a screen lists exactly the concepts a line counted.
   * Without it the screen had to guess from the arrays — and a concept whose path is gone can
   * *also* have another path that moved, so it appeared under both the missing line and the
   * moved line while only one of them had counted it (2026-09-20).
   */
  verdict: 'stale' | 'missing' | 'unknown';
  /** Why, for the unknown verdicts: `folder-only` is the one the brief names on its own line. */
  reason: string | null;
  /**
   * The concept's vault document slug, which is what `get_concept` takes.
   *
   * The screen shows a concept's display title, and an agent handed that title has to search for
   * the document before it can read anything. Carrying the slug the walk already knew turns the
   * request into calls the agent can make (2026-09-20).
   */
  slug: string | null;
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
/**
 * Compare each concept's document with the code it cites, through the one rule the MCP
 * server uses (`shared/lib/evidence-verdict.mjs`). This is the line the cognitive-diff
 * experiment (2026-09-13) found worth the most — "meaning unchanged, files underneath
 * moved" — and the screen and an agent must never answer it two ways.
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
    const doc = concept.docPath ? changes.get(concept.docPath) : undefined;
    const { verdict, reason, moved, folders, gone } = judgeEvidence({
      docChangedAt: concept.docPath ? (doc?.lastChangedAt ?? null) : null,
      entries: concept.evidencePaths.map((path) => ({ path, change: changes.get(path) ?? null })),
    });
    if (verdict === 'current') current.add(concept.id);
    else if (verdict === 'stale') stale.add(concept.id);
    else if (verdict === 'missing') missing.add(concept.id);
    else {
      if (reason === 'folder-only') folderOnly.add(concept.id);
      unknown.add(concept.id);
    }
    if (verdict !== 'current') {
      rows.push({
        id: concept.id,
        slug: concept.docPath ? concept.docPath.replace(/\.md$/, '') : null,
        verdict,
        reason: reason ?? null,
        docChangedAt: doc?.lastChangedAt ?? null,
        moved,
        gone,
        folders,
      });
    }
  }
  return { current, stale, missing, unknown, folderOnly, rows };
}
