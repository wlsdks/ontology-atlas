import { judgeEvidence } from '@/shared/lib/git/evidence-verdict.mjs';

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
   * Which state this concept was counted under, so a screen lists exactly the concepts a line counted;
   * a concept can be missing and also have a moved path.
   */
  verdict: 'stale' | 'missing' | 'unknown';
  /** Why, for the unknown verdicts: `folder-only` is the one the brief names on its own line. */
  reason: string | null;
  /**
   * The vault document slug that `get_concept` takes; the display title alone forces an agent to
   * search first.
   */
  slug: string | null;
  /** ISO time of the concept document's own newest commit, when the walk supplied one. */
  docChangedAt: string | null;
  /** Files cited by this concept that changed after the document. */
  moved: readonly { path: string; changedAt: string }[];
  gone: readonly string[];
  folders: readonly { path: string; changedAt: string }[];
}

export interface EvidenceStates {
  /** Every evidence path exists and none changed after the concept's document did. */
  current: ReadonlySet<string>;
  /** Some evidence path changed after the document did: the meaning stands on moved ground. */
  stale: ReadonlySet<string>;
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
 * Compares each concept's document with the code it cites through the one rule the MCP server uses,
 * so the screen and an agent agree.
 */
export function resolveEvidenceStates(
  concepts: readonly EvidenceConceptInput[],
  changes: ReadonlyMap<string, EvidenceChange>,
  sourceChanges: ReadonlyMap<string, EvidenceChange> = changes,
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
      entries: concept.evidencePaths.map((path) => ({ path, change: sourceChanges.get(path) ?? null })),
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

/** The two facts `buildEvidenceConcepts` reads from a vault document. */
export interface EvidenceSourceDoc {
  slug: string;
  frontmatter: { path?: unknown; elements?: unknown };
}

/**
 * Where each concept's evidence lives, from the vault alone: its own `path:` and the `path:` of
 * every element it lists. One builder for every screen that asks the Git walk, so the insights
 * brief and the map send the same paths and judge the same concepts.
 */
export function buildEvidenceConcepts(
  docs: readonly EvidenceSourceDoc[],
  nodes: readonly { id: string; docSlug?: string | null }[],
): EvidenceConceptInput[] {
  const pathBySlug = new Map<string, string>();
  const docBySlug = new Map<string, EvidenceSourceDoc>();
  for (const doc of docs) {
    if (!docBySlug.has(doc.slug)) docBySlug.set(doc.slug, doc);
    const path = doc.frontmatter.path;
    if (typeof path === 'string' && path.length > 0) pathBySlug.set(doc.slug, path);
  }
  const out: EvidenceConceptInput[] = [];
  for (const node of nodes) {
    if (!node.docSlug) continue;
    const doc = docBySlug.get(node.docSlug);
    if (!doc) continue;
    const own = pathBySlug.get(doc.slug);
    const elements = Array.isArray(doc.frontmatter.elements)
      ? (doc.frontmatter.elements as unknown[]).filter((slug): slug is string => typeof slug === 'string')
      : [];
    const paths = new Set<string>();
    if (own) paths.add(own);
    for (const slug of elements) {
      const path = pathBySlug.get(slug);
      if (path) paths.add(path);
    }
    out.push({ id: node.id, docPath: `${doc.slug}.md`, evidencePaths: [...paths] });
  }
  return out;
}
