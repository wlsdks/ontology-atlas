import { containmentKeyFor } from '@/shared/lib/vault-document/containment-keys';
import { slugify } from '@/shared/lib/vault-document/slugify';

import type { MeaningEditRelation } from './ontology-node-href';
import { IMPACT_RELATION_TYPES } from './ontology-tree/reachability';
import type { OntologyChangeSet } from './ontology-change-set';

/**
 * The key the MCP writer (`RELATION_KEY` in `mcp/src/tools/relation-keys.mjs`) stores each relation
 * under. `contains` gives way to the typed list when the endpoint kinds have one
 * (`relationFrontmatterKey`); `broader` has no MCP writer and keeps the schema's key.
 */
const RELATION_FRONTMATTER_KEY: Record<MeaningEditRelation, string> = {
  isA: 'broader',
  dependsOn: 'dependencies',
  contains: 'contains',
  relates: 'relates',
};

/** Spellings the read layer folds into a key (`NEIGHBOR_KEY_ALIASES` in `mcp/src/vault/relation-refs.mjs`). */
const KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  dependencies: ['depends_on'],
};

/** The lists `add_concept` always writes per kind (`arrayDefaults` in `mcp/src/schema.mjs`). */
const SCAFFOLD_LISTS: Readonly<Record<string, readonly string[]>> = {
  project: ['domains', 'capabilities', 'elements'],
  domain: ['capabilities'],
  capability: ['elements'],
};

export const RELATION_EDGE_TYPE: Record<MeaningEditRelation, string> = {
  isA: 'is_a',
  dependsOn: 'depends_on',
  contains: 'contains',
  relates: 'related_to',
};

export const IMPACT_EDIT_RELATIONS: readonly MeaningEditRelation[] = (
  Object.keys(RELATION_EDGE_TYPE) as MeaningEditRelation[]
).filter((relation) => IMPACT_RELATION_TYPES.includes(RELATION_EDGE_TYPE[relation]));

export function relationFrontmatterKey(
  relation: MeaningEditRelation,
  sourceKind?: string | null,
  targetKind?: string | null,
): string {
  if (relation === 'contains') return containmentKeyFor(sourceKind, targetKind) ?? 'contains';
  return RELATION_FRONTMATTER_KEY[relation];
}

/** Every key an existing relation of this type may already sit under, the written key first. */
function relationReadKeys(relation: MeaningEditRelation, sourceKind?: string | null, targetKind?: string | null): string[] {
  const key = relationFrontmatterKey(relation, sourceKind, targetKind);
  const keys = [key, ...(KEY_ALIASES[key] ?? [])];
  if (relation === 'contains' && key !== 'contains') keys.push('contains');
  return keys;
}

type OntologyRelationFrontmatterUpdate =
  | string[]
  | Record<string, string>
  | null;

export interface OntologyRelationEditPlan {
  updates: Record<string, OntologyRelationFrontmatterUpdate>;
  changeSet: OntologyChangeSet;
}

function refs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
  }
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

/** Deduplicated and sorted as `normalizeRelationRefs` (MCP) leaves a list it appends to. */
function normalizedRefs(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
}

function tail(value: string): string {
  const trimmed = value.trim().replace(/^ontology\//, '');
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function matchesRef(value: string, targetSlug: string): boolean {
  const normalized = value.trim().replace(/^ontology\//, '');
  const target = targetSlug.trim().replace(/^ontology\//, '');
  if (normalized === target) return true;
  // The tail fallback is for bare refs; two differing full paths never alias, or removing
  // `elements/search` would also strip `capabilities/search`.
  if (normalized.includes('/') && target.includes('/')) return false;
  return slugify(tail(normalized)) === slugify(tail(target));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** An emptied list leaves the shape creation would: `[]` for a kind's scaffold list, else deleted. */
function writtenRelationList(kind: string | undefined, key: string, list: string[]): string[] | null {
  if (list.length > 0) return list;
  return kind && SCAFFOLD_LISTS[kind]?.includes(key) ? [] : null;
}

function writtenRelationNotes(notes: Record<string, string>): Record<string, string> | null {
  return Object.keys(notes).length > 0 ? notes : null;
}

function relationNotes(frontmatter: Record<string, unknown>): Record<string, string> {
  const notes = frontmatter.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return {};
  return Object.fromEntries(
    Object.entries(notes as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
}

function kindOf(frontmatter: Record<string, unknown>): string | undefined {
  return typeof frontmatter.kind === 'string' ? frontmatter.kind : undefined;
}

function relationChangeSet(
  sourceSlug: string,
  relation: { from: string; type: string; to: string; why?: string },
  fields: OntologyChangeSet['fields'],
  remove: boolean,
): OntologyChangeSet {
  return {
    toolName: 'patch_concept',
    operation: remove ? 'remove' : 'relate',
    target: sourceSlug,
    exact: true,
    destructive: remove,
    relation,
    fields,
    itemCount: 1,
    items: [{ key: `patch_concept:0:${sourceSlug}`, target: sourceSlug, exact: true, relation, fields }],
  };
}

/**
 * One relation added, retyped or retargeted on the source document, in the keys and value shape
 * `add_relation` writes: alias spellings fold into the written key, the list is sorted, and the
 * reason sits in `relation_notes` under the target's slug.
 */
export function buildOntologyRelationEditPlan({
  sourceSlug,
  targetSlug,
  targetKind,
  fromRelation,
  fromTargetSlug,
  fromTargetKind,
  toRelation,
  why,
  frontmatter,
}: {
  sourceSlug: string;
  targetSlug: string;
  targetKind?: string | null;
  fromRelation: MeaningEditRelation | null;
  fromTargetSlug?: string | null;
  fromTargetKind?: string | null;
  toRelation: MeaningEditRelation;
  why: string;
  frontmatter: Record<string, unknown>;
}): OntologyRelationEditPlan {
  const sourceKind = kindOf(frontmatter);
  const previousTarget = fromRelation ? (fromTargetSlug ?? targetSlug) : null;
  const previousKeys = fromRelation
    ? relationReadKeys(fromRelation, sourceKind, fromTargetKind ?? targetKind)
    : [];
  const targetKey = relationFrontmatterKey(toRelation, sourceKind, targetKind);
  const targetKeys = relationReadKeys(toRelation, sourceKind, targetKind);
  const touchedKeys = [...new Set([...previousKeys, ...targetKeys])];
  const next = Object.fromEntries(touchedKeys.map((key) => [key, refs(frontmatter[key])])) as Record<string, string[]>;

  const sameRelation =
    previousTarget !== null && fromRelation === toRelation && matchesRef(previousTarget, targetSlug);
  if (previousTarget && !sameRelation) {
    for (const key of previousKeys) {
      next[key] = next[key].filter((entry) => !matchesRef(entry, previousTarget));
    }
  }
  const aliasKeys = KEY_ALIASES[targetKey] ?? [];
  const alreadyThere = targetKeys.some((key) => next[key].some((entry) => matchesRef(entry, targetSlug)));
  if (!alreadyThere) {
    next[targetKey] = normalizedRefs([...next[targetKey], ...aliasKeys.flatMap((key) => next[key]), targetSlug]);
    for (const key of aliasKeys) next[key] = [];
  }

  const updates: Record<string, OntologyRelationFrontmatterUpdate> = {};
  const fields: OntologyChangeSet['fields'] = [];
  for (const key of touchedKeys) {
    const before = refs(frontmatter[key]);
    const after = next[key];
    if (sameValue(before, after)) continue;
    updates[key] = aliasKeys.includes(key) && after.length === 0 ? null : writtenRelationList(sourceKind, key, after);
    fields.push({ key, before, after });
  }

  const trimmedWhy = why.trim();
  const beforeNotes = relationNotes(frontmatter);
  const afterNotes = { ...beforeNotes };
  if (previousTarget && !matchesRef(previousTarget, targetSlug)) {
    for (const key of Object.keys(afterNotes)) {
      if (matchesRef(key, previousTarget)) delete afterNotes[key];
    }
  }
  if (trimmedWhy) {
    for (const key of Object.keys(afterNotes)) {
      if (key !== targetSlug && matchesRef(key, targetSlug)) delete afterNotes[key];
    }
    afterNotes[targetSlug] = trimmedWhy;
  }
  if (!sameValue(beforeNotes, afterNotes)) {
    updates.relation_notes = writtenRelationNotes(afterNotes);
    fields.push({ key: 'relation_notes', before: beforeNotes, after: afterNotes });
  }

  const relation = {
    from: sourceSlug,
    type: RELATION_EDGE_TYPE[toRelation],
    to: targetSlug,
    ...(trimmedWhy ? { why: trimmedWhy } : {}),
  };
  return { updates, changeSet: relationChangeSet(sourceSlug, relation, fields, false) };
}

export function buildOntologyRelationRemovalPlan({
  sourceSlug,
  targetSlug,
  targetKind,
  relation,
  frontmatter,
}: {
  sourceSlug: string;
  targetSlug: string;
  targetKind?: string | null;
  relation: MeaningEditRelation;
  frontmatter: Record<string, unknown>;
}): OntologyRelationEditPlan {
  const sourceKind = kindOf(frontmatter);
  const updates: Record<string, OntologyRelationFrontmatterUpdate> = {};
  const fields: OntologyChangeSet['fields'] = [];
  const removedFrom = new Map<string, string[]>();
  for (const key of relationReadKeys(relation, sourceKind, targetKind)) {
    const before = refs(frontmatter[key]);
    const after = before.filter((entry) => !matchesRef(entry, targetSlug));
    if (sameValue(before, after)) continue;
    removedFrom.set(key, after);
    updates[key] = writtenRelationList(sourceKind, key, after);
    fields.push({ key, before, after });
  }

  const relationKeys = new Set([
    ...Object.values(RELATION_FRONTMATTER_KEY),
    ...Object.values(KEY_ALIASES).flat(),
    'domains',
    'capabilities',
    'elements',
  ]);
  const stillLinked = [...relationKeys].some((key) =>
    (removedFrom.get(key) ?? refs(frontmatter[key])).some((entry) => matchesRef(entry, targetSlug)),
  );
  if (!stillLinked) {
    const beforeNotes = relationNotes(frontmatter);
    const afterNotes = Object.fromEntries(
      Object.entries(beforeNotes).filter(([key]) => !matchesRef(key, targetSlug)),
    );
    if (!sameValue(beforeNotes, afterNotes)) {
      updates.relation_notes = writtenRelationNotes(afterNotes);
      fields.push({ key: 'relation_notes', before: beforeNotes, after: afterNotes });
    }
  }

  return {
    updates,
    changeSet: relationChangeSet(
      sourceSlug,
      { from: sourceSlug, type: RELATION_EDGE_TYPE[relation], to: targetSlug },
      fields,
      true,
    ),
  };
}

export interface RelationTargetCandidate {
  id: string;
  slug: string;
  kind: string;
  /** The display name first, then the other spellings a person may type (`title`, `display_*`). */
  names: readonly string[];
}

/** Which kinds a relation of this type may join, per spec §2/§5. */
export function relationTargetAllowed(
  relation: MeaningEditRelation,
  sourceKind: string,
  targetKind: string,
): boolean {
  if (relation === 'isA') {
    return targetKind === sourceKind && ['domain', 'capability', 'element'].includes(sourceKind);
  }
  if (relation === 'contains') return containmentKeyFor(sourceKind, targetKind) !== null;
  return true;
}

/** The relation types a concept of this kind may start; `contains` and `isA` need a kind that holds or narrows. */
export function relationsAllowedFor(sourceKind: string): MeaningEditRelation[] {
  const relations: MeaningEditRelation[] = ['dependsOn', 'relates'];
  if (['project', 'domain', 'capability'].includes(sourceKind)) relations.push('contains');
  if (['domain', 'capability', 'element'].includes(sourceKind)) relations.push('isA');
  return relations;
}

/**
 * The concepts a relation may point at, narrowed by a query against every name each one carries,
 * case-insensitively. O(candidates × names).
 */
export function eligibleRelationTargets<T extends RelationTargetCandidate>(
  source: { id: string; kind: string },
  candidates: readonly T[],
  relation: MeaningEditRelation,
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return candidates.filter(
    (candidate) =>
      candidate.id !== source.id &&
      relationTargetAllowed(relation, source.kind, candidate.kind) &&
      (!needle || candidate.names.some((name) => name.toLocaleLowerCase().includes(needle))),
  );
}
