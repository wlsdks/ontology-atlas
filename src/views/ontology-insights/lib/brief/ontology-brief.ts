import { isAfter, type BriefCore, type BriefLine } from './brief-model';
import { isCanonicalConcept } from '@/entities/knowledge-graph';

/** The slice of `KnowledgeGraphNode` the brief reads. */
export interface OntologyBriefNode {
  id: string;
  kind: string;
  /** The concept's display name, for the rows a line names. */
  title?: string;
  /** `created_by`, verbatim. Absent defaults to human, as the schema says. */
  createdBy?: string | null;
  /** `evidenceIds[0]` — the vault doc slug this node was derived from, when it owns one. */
  docSlug?: string | null;
}

/** Per-doc facts from the vault manifest: who reviewed it, when it last changed. */
interface OntologyBriefDoc {
  /** `reviewed_by`, verbatim; a person's mark. Absent when nobody judged the meaning. */
  reviewedBy?: string | null;
  /** ISO timestamp of the file's last change. */
  updatedAt?: string | null;
}

/**
 * Evidence state per node, produced by the installed app's Git bridge once it can read the
 * code beside the vault. `null` means this session could not check (browser, no Git):
 * every node with evidence is then `unknown`, never quietly `current`.
 */
interface OntologyEvidenceStates {
  current: ReadonlySet<string>;
  stale: ReadonlySet<string>;
  /** Evidence paths no longer on disk — the meaning points at nothing. */
  missing: ReadonlySet<string>;
  /** Only a folder-level path moved: something under it changed, which is not yet a verdict. */
  folderOnly: ReadonlySet<string>;
}

export interface OntologyBriefInput {
  nodes: readonly OntologyBriefNode[];
  docs: ReadonlyMap<string, OntologyBriefDoc>;
  evidence: OntologyEvidenceStates | null;
  /** Why evidence is absent; app sessions must never suggest installing the app. */
  evidenceAvailability?: Extract<BriefCore['availability'], 'app-only' | 'reading' | 'unreadable' | 'no-source'>;
  /** The to-do tab's verdict total: findings a person can act on. */
  repairCount: number;
  /** Names agents asked this folder for that it does not hold. */
  unmatchedCount: number;
  anchorMs: number;
}

/*
 * ⚠️ **One word, one number.** This used to count `domain | capability | element`, while the
 * census strip 100px above it counts every node that is not the vault readme. Both are labelled
 * "concept", so on the sample folder the card read 124 and the strip read 125, one click apart,
 * and a reader had no way to reconcile them (walkthrough, 2026-09-20). `canonical-census.ts` states the
 * rule this broke: every count that uses the word "concept" goes through it.
 */

/**
 * Why the concepts' evidence has no verdict yet, in the order the facts outrank each other.
 *
 * ⚠️ **A walk in flight is a read in flight, whatever else is known.** The unbound-repository answer
 * used to outrank it, so a folder with Git but no bound project said "no repository" while the walk
 * ran and then, when it landed, turned into measured lines and a different headline with nothing in
 * between: the same silent change the harness scan made (real bridge, 2026-09-25). And a folder
 * whose walk failed but has no bound project still says "connect a repository", the one fix that
 * helps there.
 */
export function evidenceAvailability(input: {
  /** The installed app's Git bridge exists here. */
  bridge: boolean;
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
  return input.walkFailed ? 'unreadable' : 'reading';
}

function isAgentWritten(createdBy: string | null | undefined): boolean {
  return typeof createdBy === 'string' && (createdBy.startsWith('agent:') || createdBy.startsWith('model:'));
}

export function buildOntologyBrief(input: OntologyBriefInput): BriefCore {
  const concepts = input.nodes.filter(isCanonicalConcept);
  let current = 0;
  let stale = 0;
  let unknown = 0;
  let missing = 0;
  let folderOnly = 0;
  let agentUnreviewed = 0;
  let changedSince = 0;
  /*
   * The concepts the headline may call unknown, as a set rather than as a sum of the lines
   * below. `ontology-evidence-folder-only` is a subset of `ontology-evidence-unchecked`, and an
   * agent-written concept nobody reviewed can be in any evidence state, so three lines describe
   * overlapping sets of the same concepts — added, they claimed 205 unchecked items over 108
   * concepts (measured on this repository's own vault, 2026-09-21). The lines keep their own
   * counts: each answers its own question, and only their sum was the lie.
   */
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
    // The repair queue is work already listed on its own tab, not a belief that went wrong.
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
      /* The two stale lines partition the stale concepts (`stale - missing`, then `missing`), so
         their sum is already distinct. */
      stale: input.evidence ? stale : 0,
      /* Concepts counted once, plus the unmatched names — those are not concepts this folder
         holds, so they cannot double-count one. */
      unknown: unknownConcepts.size + input.unmatchedCount,
    },
  };
}
