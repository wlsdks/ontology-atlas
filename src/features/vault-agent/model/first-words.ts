import {
  detectMeaningGaps,
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type ConceptDocFacts,
  type KnowledgeGraphNode,
} from '@/entities/knowledge-graph';

/**
 * Opening lines drawn from the folder's real state. Pure and model-free: a chip is built before
 * consent, so a call would be an unconsented transfer (`tests/contract/agent-first-words-local.contract.test.ts`).
 * A chip is a prefill, and one generator feeds every entrance.
 */

/** Where a chip sits — a fixed priority: screen → queue → standing. */
type FirstWordsSlot = 'screen' | 'queue' | 'standing';

/** What the sentence means, kept apart from the locale; only this travels through a URL. */
export type FirstWordsIntent =
  | { kind: 'missing-definition'; ref: string; title: string }
  | { kind: 'missing-domain'; ref: string; title: string }
  | { kind: 'missing-relations'; ref: string; title: string }
  | { kind: 'map-review' }
  | { kind: 'empty-vault' };

/** Intent names that can travel through a URL — only those naming a single node. */
export type FirstWordsNodeIntentKind =
  | 'missing-definition'
  | 'missing-domain'
  | 'missing-relations';

const NODE_INTENT_KINDS: ReadonlySet<string> = new Set([
  'missing-definition',
  'missing-domain',
  'missing-relations',
]);

export function parseNodeIntentKind(raw: string | null): FirstWordsNodeIntentKind | null {
  if (!raw) return null;
  return NODE_INTENT_KINDS.has(raw) ? (raw as FirstWordsNodeIntentKind) : null;
}

export interface FirstWordsChip {
  /** React key plus test identity — the same state gives the same value. */
  id: string;
  slot: FirstWordsSlot;
  intent: FirstWordsIntent;
  /** The sentence seated verbatim in the input box. */
  text: string;
}

  /** The screen's language. The app writes the sentences; the model does not. */
export interface FirstWordsLabels {
  missingDefinition: (title: string) => string;
  missingDomain: (title: string) => string;
  missingRelations: (title: string) => string;
  mapReview: string;
  emptyVault: string;
}

export function sentenceForIntent(
  intent: FirstWordsIntent,
  labels: FirstWordsLabels,
): string {
  switch (intent.kind) {
    case 'missing-definition':
      return labels.missingDefinition(intent.title);
    case 'missing-domain':
      return labels.missingDomain(intent.title);
    case 'missing-relations':
      return labels.missingRelations(intent.title);
    case 'empty-vault':
      return labels.emptyVault;
    case 'map-review':
    default:
      return labels.mapReview;
  }
}

export type FirstWordsNode = Pick<
  KnowledgeGraphNode,
  'id' | 'kind' | 'title' | 'evidenceIds' | 'hasOwnDocument' | 'agentSlug' | 'ref'
> & { display?: string | null };

/** The screen slot's sentence, shared with node detail's "ask the agent"; null for a derived concept without a document. */
export function screenIntentFor(
  node: FirstWordsNode | null | undefined,
  docFacts: ReadonlyMap<string, ConceptDocFacts>,
): FirstWordsIntent | null {
  if (!node) return null;
  const { ownSlug } = resolveNodeDocument(node);
  if (!ownSlug) return null;
  const doc = docFacts.get(ownSlug);
  if (!doc) return null;
  const ref = resolveNodeAgentTarget(node).ref ?? ownSlug;
  const gaps = detectMeaningGaps(node, doc);
  return {
    kind: gaps[0] ?? 'missing-relations',
    ref,
    title: node.display ?? node.title,
  };
}

export interface BuildFirstWordsInput {
  nodes: readonly FirstWordsNode[];
  /** Doc slug → frontmatter facts. The map `useVaultConceptFacts` builds. */
  docFacts: ReadonlyMap<string, ConceptDocFacts>;
  /** The handoff name from `resolveNodeAgentTarget`, the same one screen-context injection uses. */
  focusedRef: string | null;
}

/** One chip per slot. */
const FIRST_WORDS_MAX_CHIPS = 3;

/** Candidates in fixed slot priority; a slot that cannot be filled is not created. */
export function buildFirstWords(
  input: BuildFirstWordsInput,
  labels: FirstWordsLabels,
): FirstWordsChip[] {
  const concepts = collectConcepts(input.nodes, input.docFacts);

  // An empty folder gets one chip that names no concept.
  if (concepts.length === 0) {
    return [
      {
        id: 'first-words:empty-vault',
        slot: 'standing',
        intent: { kind: 'empty-vault' },
        text: labels.emptyVault,
      },
    ];
  }

  const chips: FirstWordsChip[] = [];

  // Screen slot, omitted without a focus.
  const focused = input.focusedRef
    ? concepts.find((concept) => concept.ref === input.focusedRef)
    : undefined;
  if (focused) {
    chips.push(chipFor('screen', intentFor(focused), labels));
  }

  // Queue slot, by the to-do queue's verdict, skipping the screen slot's concept.
  const queued = concepts.find(
    (concept) => concept.gaps.length > 0 && concept.ref !== focused?.ref,
  );
  if (queued) {
    chips.push(chipFor('queue', intentFor(queued), labels));
  }

  // ③ The standing slot — the floor that gives even a defect-free folder an opening line.
  chips.push({
    id: 'first-words:map-review',
    slot: 'standing',
    intent: { kind: 'map-review' },
    text: labels.mapReview,
  });

  return chips.slice(0, FIRST_WORDS_MAX_CHIPS);
}

/** One node's intent for a queue row or node detail, through the same generator as the chips. */
export function nodeIntent(
  node: FirstWordsNode | null | undefined,
  kind: FirstWordsNodeIntentKind,
): FirstWordsIntent | null {
  if (!node) return null;
  const ref = resolveNodeAgentTarget(node).ref;
  if (!ref) return null;
  return { kind, ref, title: node.display ?? node.title };
}

interface ConceptFact {
  ref: string;
  title: string;
  gaps: ReturnType<typeof detectMeaningGaps>;
}

/** Concepts with their own `.md`, judged by `resolveNodeDocument` alone. */
function collectConcepts(
  nodes: readonly FirstWordsNode[],
  docFacts: ReadonlyMap<string, ConceptDocFacts>,
): ConceptFact[] {
  const concepts: ConceptFact[] = [];
  for (const node of nodes) {
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue;
    const doc = docFacts.get(ownSlug);
    if (!doc) continue;
    const ref = resolveNodeAgentTarget(node).ref ?? ownSlug;
    concepts.push({
      ref,
      title: node.display ?? node.title,
      gaps: detectMeaningGaps(node, doc),
    });
  }
  // By name, so the same folder always gives the same chip order.
  concepts.sort((a, b) => a.title.localeCompare(b.title));
  return concepts;
}

/** Names a blank if there is one; otherwise a question, which is never false. */
function intentFor(concept: ConceptFact): FirstWordsIntent {
  const kind = concept.gaps[0] ?? 'missing-relations';
  return { kind, ref: concept.ref, title: concept.title };
}

function chipFor(
  slot: FirstWordsSlot,
  intent: FirstWordsIntent,
  labels: FirstWordsLabels,
): FirstWordsChip {
  const target = 'ref' in intent ? intent.ref : intent.kind;
  return {
    id: `first-words:${slot}:${intent.kind}:${target}`,
    slot,
    intent,
    text: sentenceForIntent(intent, labels),
  };
}
