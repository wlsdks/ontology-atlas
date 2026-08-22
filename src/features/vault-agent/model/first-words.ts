import {
  detectMeaningGaps,
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type ConceptDocFacts,
  type KnowledgeGraphNode,
} from '@/entities/knowledge-graph';

/**
 * **Opening lines** — sentences drawn from this folder's real state, placed in
 * front of someone facing an empty input box.
 *
 * **Why it is needed.** Someone using Cursor has the code in front of them and
 * knows what to ask. Someone opening this app is doing concept design for the
 * first time, so **an empty input box is blank-page fear**. Without an opening
 * line, the flow stops right after entering a key and passing the scope sheet.
 *
 * **Contract — no model is called here.** This file is **pure functions only**:
 * it imports no network, no bridge, no provider. The chips are drawn at a moment
 * the user has not yet consented, so a single call made to build a chip would be
 * **a transmission without consent and unauthorized use of someone else's money
 * (BYOK billing)**. That is why the design where the agent speaks first (an
 * automatic first turn) was rejected, and this file's purity is what makes that
 * rejection hold. Locked by
 * `tests/contract/agent-first-words-local.contract.test.ts`.
 *
 * **A chip is a prefill, not a send.** Pressing one only seats the sentence in
 * the input box. It can be edited or deleted — the user's words are not taken
 * away. Sending is always [send].
 *
 * **There is one sentence generator.** The same function feeds three places:
 * ① the chips in an empty conversation ② the **plain list** shown when there is
 * no key or folder (never drawing a button that cannot be completed) ③ the
 * prefill when arriving from a queue row or node detail. Two generators would
 * eventually make the two entrances say different things.
 */

/** Where a chip sits — a fixed priority: screen → queue → standing. */
export type FirstWordsSlot = 'screen' | 'queue' | 'standing';

/**
 * What the sentence means to say. Kept separate from the screen's language
 * because one intent becomes two sentences (ko and en), and when carried through
 * a URL only this kind needs to travel.
 */
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

/**
 * **The screen slot's one sentence** — the biggest gap in the concept currently
 * being viewed.
 *
 * The empty conversation's first chip and node detail's "ask the agent" both pass
 * through **this same function**. If the two entrances each composed their own
 * sentence they would describe one concept two ways, and from then on the user
 * has to ask which is real.
 *
 * A derived concept with no document returns null — telling a concept with no
 * file to edit to "write down its meaning" means telling it to edit someone
 * else's document.
 */
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
  /**
   * The **handoff name** of the concept being viewed — it must be the value
   * `resolveNodeAgentTarget` decided. Matching the name used by screen-context
   * injection is what makes the person and the agent point at the same concept.
   */
  focusedRef: string | null;
}

/** Maximum chips — three, because there are three slots. Not increased (the answer to blank-page fear is accuracy, not quantity). */
export const FIRST_WORDS_MAX_CHIPS = 3;

/**
 * Draws opening-line candidates from this folder's state. Slot priority is fixed,
 * and **a slot that cannot be filled is not created** — drawing an empty chip
 * just to fill the space produces a control that cannot be pressed, a trap this
 * panel has already fixed once.
 */
export function buildFirstWords(
  input: BuildFirstWordsInput,
  labels: FirstWordsLabels,
): FirstWordsChip[] {
  const concepts = collectConcepts(input.nodes, input.docFacts);

  // A folder with nothing in it yet — three are not forced. Talking about concepts
  // with no concept to name makes the very first sentence false.
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

  // ① The screen slot — the biggest gap in the concept being viewed. Omitted when
  //    there is no focus (do not claim something that is not there).
  const focused = input.focusedRef
    ? concepts.find((concept) => concept.ref === input.focusedRef)
    : undefined;
  if (focused) {
    chips.push(chipFor('screen', intentFor(focused), labels));
  }

  // ② The queue slot — the first concept chosen by **the same verdict** the to-do
  //    queue uses. A concept the screen slot already took is skipped (do not say
  //    the same thing twice).
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

/**
 * A single intent naming one node, used when arriving from a queue row or node
 * detail. It passes through **the same function** as the chips, so there is
 * nowhere for the two entrances' sentences to diverge.
 */
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

/**
 * Keeps only concepts a chip may name — those with **their own `.md`** (a file to
 * edit) whose facts the manifest knows. The verdict comes from
 * `resolveNodeDocument` alone: writing a new one reopens the accident of telling
 * the agent to edit someone else's document.
 */
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
  // By name — if chips changed places when the same folder is opened twice, the
  // user has to hunt for the sentence they just read.
  concepts.sort((a, b) => a.title.localeCompare(b.title));
  return concepts;
}

/**
 * This concept's opening line. If a blank exists it names it; otherwise it stays a
 * **question** — "check whether any connections are missing" asserts nothing, so
 * it is not false even for a healthy concept.
 */
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
