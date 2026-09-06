import type { OntologyChangeSet } from '@/entities/knowledge-graph';

/**
 * Turns a typed change set into the words a person answers with.
 *
 * ⚠️ **Why this file exists** (owner, on the installed app at 1512×982, 2026-09-06:
 * *"can this design be improved? … something is lacking"*).
 *
 * The card headed every ontology write with one fixed sentence — 「Review the proposed change」 —
 * and then printed the raw request underneath: a slug in mono, a frontmatter key in mono, and the
 * argument value beside it. Everything on the screen was true and nothing on it was an answer to
 * *what will change, in which file*. The person had to reconstruct the sentence themselves from a
 * debugger's dump before they could press either button.
 *
 * Every fact needed for that sentence was already typed and already on screen: the operation, the
 * target slug, the field names, and how many values each field carries. This module composes them
 * into one line.
 *
 * **Derive, never guess.** Each branch below reads a value the request actually carried. When a
 * fact is missing there is a variant that omits it — 「it updates this document」 rather than a
 * plausible name — because a permission card that invents a subject is worse than one that admits
 * it does not know which document is meant.
 */

/** One line of a sentence map: a target slug and the sentence written about it. */
export interface OntologyChangeSentence {
  /** The frontmatter key inside the map — a target slug for `relation_notes`. */
  target: string;
  /** The sentence that will be written. */
  text: string;
  /** The sentence currently in the file, when the change set carried one. Never inferred. */
  before?: string;
}

/**
 * A map of sentences, or `null` when the value is anything else.
 *
 * `relation_notes` is the schema's one map-of-strings on every kind, and it is the value that made
 * this card unreadable: eight reasons arrived as a single JSON string on one line. The shape is
 * tested rather than the key name, so a future map of sentences reads correctly without an edit.
 */
export function sentenceMap(value: unknown): OntologyChangeSentence[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (!entries.every(([, entry]) => typeof entry === 'string')) return null;
  return entries.map(([target, text]) => ({ target, text: text as string }));
}

/**
 * The same map, carrying whatever previous sentence the change set held.
 *
 * Only a manual editor holds the current document, so `before` is present there and absent for an
 * ACP request. An entry with no previous sentence is left without one rather than being given an
 * empty string, which would render as 「changed from nothing」 — a claim the request never made.
 */
export function sentenceMapChange(
  after: unknown,
  before: unknown,
): OntologyChangeSentence[] | null {
  const next = sentenceMap(after);
  if (!next) return null;
  const previous = sentenceMap(before);
  if (!previous) return next;
  const byTarget = new Map(previous.map((entry) => [entry.target, entry.text]));
  return next.map((entry) => {
    const was = byTarget.get(entry.target);
    return was === undefined || was === entry.text ? entry : { ...entry, before: was };
  });
}

/** An array of plain strings reads as one line each, never as a JSON literal. */
export function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null;
}

/**
 * The readable end of a slug: `projects/ontology-atlas` → `ontology-atlas`.
 *
 * The folder prefix is a filing detail; the name is what the person recognises. The full slug still
 * appears in the review beneath, so nothing is hidden — this only decides which half leads the
 * sentence.
 */
export function conceptName(target: string | null | undefined): string | null {
  if (typeof target !== 'string') return null;
  const segments = target.trim().split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

/**
 * Frontmatter keys this product can name in plain words.
 *
 * A key outside this set keeps its raw spelling in mono. Inventing a friendly name for a key we do
 * not know would be the one failure this card cannot afford: a person approving a write they were
 * shown under the wrong name.
 */
const PLAIN_FIELD_KEYS: ReadonlySet<string> = new Set([
  'title',
  'kind',
  'domain',
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
  'relation_notes',
  'description',
  'status',
  'path',
  'body',
  'display',
]);

/** The `ontologyChangeReview` message key for a field's plain name, or `null` when there is none. */
export function fieldNameKey(key: string): string | null {
  return PLAIN_FIELD_KEYS.has(key) ? `fieldName.${key}` : null;
}

export interface OntologyChangeHeadline {
  /** A key under `ontologyChangeReview.headline`. */
  key: string;
  values: Record<string, string | number>;
  /**
   * A frontmatter key the caller renders as `{field}` — translated when
   * `fieldNameKey` knows it, left in its raw spelling when it does not.
   */
  fieldKey?: string;
}

/**
 * One sentence for the whole request, composed from typed facts only.
 *
 * The order of the branches is the order of certainty: a batch says how many rows it carries, a
 * relation says which two concepts it joins, and a single-document write says which document and
 * what part of it. Each branch has a variant for the fact it could not read.
 */
export function ontologyChangeHeadline(changeSet: OntologyChangeSet): OntologyChangeHeadline {
  const name = conceptName(changeSet.target);

  if (changeSet.itemCount > 1) {
    const count = changeSet.itemCount;
    if (changeSet.operation === 'create') return { key: 'createBatch', values: { count } };
    if (changeSet.operation === 'relate') return { key: 'relateBatch', values: { count } };
    return { key: 'batch', values: { count } };
  }

  const relation = changeSet.relation;
  if (relation) {
    return {
      key: 'relate',
      values: {
        from: conceptName(relation.from) ?? relation.from,
        to: conceptName(relation.to) ?? relation.to,
      },
    };
  }

  if (changeSet.operation === 'create') {
    const titled = changeSet.fields.find((field) => field.key === 'title');
    const label = typeof titled?.after === 'string' && titled.after.trim() ? titled.after.trim() : name;
    return label ? { key: 'createNamed', values: { name: label } } : { key: 'create', values: {} };
  }

  if (changeSet.operation === 'remove') {
    return name ? { key: 'removeNamed', values: { name } } : { key: 'remove', values: {} };
  }
  if (changeSet.operation === 'rename') {
    return name ? { key: 'renameNamed', values: { name } } : { key: 'rename', values: {} };
  }
  if (changeSet.operation === 'merge') {
    return name ? { key: 'mergeNamed', values: { name } } : { key: 'merge', values: {} };
  }

  const suffix = name ? '' : 'NoTarget';
  const named: Record<string, string | number> = name ? { name } : {};

  if (changeSet.fields.length === 1) {
    const field = changeSet.fields[0];
    const sentences = sentenceMap(field.after);
    if (sentences) {
      return {
        key: `updateEntries${suffix}`,
        values: { ...named, count: sentences.length },
        fieldKey: field.key,
      };
    }
    return { key: `updateField${suffix}`, values: named, fieldKey: field.key };
  }

  if (changeSet.fields.length > 1) {
    return { key: `updateFields${suffix}`, values: { ...named, count: changeSet.fields.length } };
  }

  if (changeSet.operation === 'write') {
    return name ? { key: 'writeNamed', values: { name } } : { key: 'write', values: {} };
  }
  return { key: `update${suffix}`, values: named };
}
