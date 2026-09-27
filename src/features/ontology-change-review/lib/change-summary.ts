import type { OntologyChangeSet } from '@/entities/knowledge-graph';

/**
 * Turns a typed change set into the sentence a person answers. Derive, never guess: a missing
 * fact has a variant that omits it, because a card that invents a subject is worse.
 */

/** One line of a sentence map: a target slug and the sentence written about it. */
export interface OntologyChangeSentence {
  /** The frontmatter key inside the map — a target slug for `relation_notes`. */
  target: string;
  /** The sentence that will be written. */
  text: string;
  /** The sentence currently in the file, when the change set carried one. Never inferred. */
  before?: string;
  /** Explicit map-entry delta when both map snapshots are known. */
  change?: 'added' | 'removed' | 'changed' | 'unchanged';
}

/** A map of sentences, or `null`; tested by shape, not key name. */
export function sentenceMap(value: unknown): OntologyChangeSentence[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (!entries.every(([, entry]) => typeof entry === 'string')) return null;
  return entries.map(([target, text]) => ({ target, text: text as string }));
}

/** The same map with any previous sentence; absent `before` stays absent, never "changed from nothing". */
export function sentenceMapChange(
  after: unknown,
  before: unknown,
): OntologyChangeSentence[] | null {
  const emptyAfter = Boolean(after && typeof after === 'object' && !Array.isArray(after) && Object.keys(after as object).length === 0);
  const next = sentenceMap(after) ?? (emptyAfter ? [] : null);
  if (!next) return null;
  const previous = sentenceMap(before);
  if (!previous) return next;
  const beforeByTarget = new Map(previous.map((entry) => [entry.target, entry.text]));
  const afterByTarget = new Map(next.map((entry) => [entry.target, entry.text]));
  return [...new Set([...afterByTarget.keys(), ...beforeByTarget.keys()])].map((target) => {
    const hadBefore = beforeByTarget.has(target);
    const hasAfter = afterByTarget.has(target);
    const was = beforeByTarget.get(target);
    const text = afterByTarget.get(target) ?? '';
    if (!hasAfter) return { target, text, before: was, change: 'removed' };
    if (!hadBefore) return { target, text, change: 'added' };
    if (was === text) return { target, text, change: 'unchanged' };
    return { target, text, before: was, change: 'changed' };
  });
}

/** An array of plain strings reads as one line each, never as a JSON literal. */
export function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : null;
}

/** `projects/ontology-atlas` → `ontology-atlas`; the full slug still appears below. */
export function conceptName(target: string | null | undefined): string | null {
  if (typeof target !== 'string') return null;
  const segments = target.trim().split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

/** Keys with plain names; any other key keeps its raw spelling, never an invented name. */
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
  /** Rendered as `{field}`: translated when `fieldNameKey` knows it, raw otherwise. */
  fieldKey?: string;
}

/** One sentence from typed facts only, branches in order of certainty. */
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
