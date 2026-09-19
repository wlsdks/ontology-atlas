import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** The slice of `KnowledgeGraphNode` the brief reads. */
export interface OntologyBriefNode {
  id: string;
  kind: string;
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
}

export interface OntologyBriefInput {
  nodes: readonly OntologyBriefNode[];
  docs: ReadonlyMap<string, OntologyBriefDoc>;
  evidence: OntologyEvidenceStates | null;
  /** The to-do tab's verdict total: findings a person can act on. */
  repairCount: number;
  /** Names agents asked this folder for that it does not hold. */
  unmatchedCount: number;
  anchorMs: number;
}

const CONCEPT_KINDS = new Set(['domain', 'capability', 'element']);

function isAgentWritten(createdBy: string | null | undefined): boolean {
  return typeof createdBy === 'string' && (createdBy.startsWith('agent:') || createdBy.startsWith('model:'));
}

export function buildOntologyBrief(input: OntologyBriefInput): BriefCore {
  const concepts = input.nodes.filter((node) => CONCEPT_KINDS.has(node.kind));
  let current = 0;
  let stale = 0;
  let unknown = 0;
  let agentUnreviewed = 0;
  let changedSince = 0;
  for (const node of concepts) {
    const doc = node.docSlug ? input.docs.get(node.docSlug) : undefined;
    if (isAgentWritten(node.createdBy) && !doc?.reviewedBy) agentUnreviewed += 1;
    if (doc && isAfter(doc.updatedAt, input.anchorMs)) changedSince += 1;
    if (input.evidence?.stale.has(node.id)) stale += 1;
    else if (input.evidence?.current.has(node.id)) current += 1;
    else unknown += 1;
  }

  const lines: BriefLine[] = [
    { id: 'ontology-evidence-moved', count: input.evidence ? stale : 0, state: 'stale' },
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
    availability: concepts.length === 0 ? 'no-data' : input.evidence ? 'measured' : 'app-only',
    headline: concepts.length,
    current: input.evidence ? current : null,
    stale: input.evidence ? stale : null,
    unknown,
    lines,
  };
}
