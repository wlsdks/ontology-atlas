import { isAfter, type BriefCore, type BriefLine } from './brief-model';
import { isCanonicalConcept } from '@/entities/knowledge-graph';

/** The slice of `KnowledgeGraphNode` the brief reads. */
export interface OntologyBriefNode {
  id: string;
  kind: string;
  /** The concept's display name, for the rows a line names. */
  title?: string;
  /** The `created_by` value verbatim; absent means human, as the schema says. */
  createdBy?: string | null;
  /** The vault doc slug this node derives from (`evidenceIds[0]`), when it owns one. */
  docSlug?: string | null;
}

/** Per-doc facts from the vault manifest: who reviewed it, when it last changed. */
interface OntologyBriefDoc {
  /** The `reviewed_by` value verbatim, a person's mark; absent when nobody judged the meaning. */
  reviewedBy?: string | null;
  /** ISO timestamp of the file's last change. */
  updatedAt?: string | null;
}

/**
 * Evidence state per node from the app's Git bridge. `null` means this session could not check (browser, no Git),
 * so every node with evidence is `unknown`, never quietly `current`.
 */
interface OntologyEvidenceStates {
  current: ReadonlySet<string>;
  stale: ReadonlySet<string>;
  /** Evidence paths no longer on disk. */
  missing: ReadonlySet<string>;
  /** Only a folder-level path moved: something under it changed, not yet a verdict. */
  folderOnly: ReadonlySet<string>;
}

export interface OntologyBriefInput {
  nodes: readonly OntologyBriefNode[];
  docs: ReadonlyMap<string, OntologyBriefDoc>;
  evidence: OntologyEvidenceStates | null;
  /** Why evidence is absent; app sessions must never suggest installing the app. */
  evidenceAvailability?: Extract<BriefCore['availability'], 'app-only' | 'reading' | 'unreadable' | 'no-source'>;
  /** The to-do tab's verdict total. */
  repairCount: number;
  /** Names agents asked this folder for that it does not hold. */
  unmatchedCount: number;
  anchorMs: number;
}

/**
 * Why the concepts' evidence has no verdict yet, in order of precedence. A walk in flight is reading whatever else
 * is known, so a folder without a bound project does not flip from "no repository" to measured lines unmarked.
 * A failed walk without a bound project still says "connect a repository".
 */
export function evidenceAvailability(input: {
  /** The installed app's Git bridge exists here. */
  bridge: boolean;
  /** The open folder has a native path to walk; a browser-picker folder has none even inside the app. */
  walkable: boolean;
  /** A walk for this load of the folder has been asked and has not answered. */
  walkPending: boolean;
  /** The walk for this load answered with nothing. */
  walkFailed: boolean;
  /** No project source is bound, so no repository is known to read. */
  noSource: boolean;
}): NonNullable<OntologyBriefInput['evidenceAvailability']> {
  if (!input.bridge) return 'app-only';
  if (input.walkPending) return 'reading';
  if (input.noSource) return 'no-source';
  // A walk nobody asked for is not in flight: without a native path this would read forever and hold the brief's sums.
  return input.walkFailed || !input.walkable ? 'unreadable' : 'reading';
}

function isAgentWritten(createdBy: string | null | undefined): boolean {
  return typeof createdBy === 'string' && (createdBy.startsWith('agent:') || createdBy.startsWith('model:'));
}

export function buildOntologyBrief(input: OntologyBriefInput): BriefCore {
  // The census strip's rule (`canonical-census.ts`), so every count labelled "concept" on this screen agrees.
  const concepts = input.nodes.filter(isCanonicalConcept);
  let current = 0;
  let stale = 0;
  let unknown = 0;
  let missing = 0;
  let folderOnly = 0;
  let agentUnreviewed = 0;
  let changedSince = 0;
  // The concepts the headline may call unknown, as a set: the three lines describe overlapping sets of the same
  // concepts, so their sum overcounts. Each line keeps its own count.
  const unknownConcepts = new Set<string>();
  for (const node of concepts) {
    const doc = node.docSlug ? input.docs.get(node.docSlug) : undefined;
    if (isAgentWritten(node.createdBy) && !doc?.reviewedBy) {
      agentUnreviewed += 1;
      unknownConcepts.add(node.id);
    }
    if (doc && isAfter(doc.updatedAt, input.anchorMs)) changedSince += 1;
    if (input.evidence?.missing.has(node.id)) {
      missing += 1;
      stale += 1;
    } else if (input.evidence?.stale.has(node.id)) stale += 1;
    else if (input.evidence?.current.has(node.id)) current += 1;
    else {
      if (input.evidence?.folderOnly.has(node.id)) folderOnly += 1;
      unknown += 1;
      unknownConcepts.add(node.id);
    }
  }

  const lines: BriefLine[] = [
    { id: 'ontology-evidence-moved', count: input.evidence ? stale - missing : 0, state: 'stale' },
    { id: 'ontology-evidence-missing', count: missing, state: 'stale' },
    { id: 'ontology-evidence-folder-only', count: folderOnly, state: 'unknown' },
    // Without the Git bridge every concept is unchecked; in the app only pathless ones remain.
    { id: 'ontology-evidence-unchecked', count: unknown, state: 'unknown' },
    { id: 'ontology-agent-unreviewed', count: agentUnreviewed, state: 'unknown' },
    { id: 'ontology-unmatched', count: input.unmatchedCount, state: 'unknown' },
    { id: 'ontology-changed-since', count: changedSince, state: 'current' },
    // Work already listed on its own tab, not a belief that went wrong.
    { id: 'ontology-repair', count: input.repairCount, state: 'current' },
  ];

  return {
    core: 'ontology',
    availability: concepts.length === 0 ? 'no-data' : input.evidence ? 'measured' : input.evidenceAvailability ?? 'app-only',
    headline: concepts.length,
    current: input.evidence ? current : null,
    stale: input.evidence ? stale : null,
    unknown,
    lines,
    headlineTotals: {
      // The two stale lines partition the stale concepts (`stale - missing`, then `missing`), so their sum is distinct.
      stale: input.evidence ? stale : 0,
      // Concepts counted once, plus unmatched names, which are not concepts this folder holds.
      unknown: unknownConcepts.size + input.unmatchedCount,
    },
  };
}
