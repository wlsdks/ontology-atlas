import { slugify } from '@/shared/lib/slugify';

import type { MeaningEditRelation } from './ontology-node-href';
import type { OntologyChangeSet } from './ontology-change-set';

const RELATION_FRONTMATTER_KEY: Record<MeaningEditRelation, string> = {
  isA: 'broader',
  dependsOn: 'dependencies',
  contains: 'contains',
  relates: 'relates',
};

export const RELATION_EDGE_TYPE: Record<MeaningEditRelation, string> = {
  isA: 'is_a',
  dependsOn: 'depends_on',
  contains: 'contains',
  relates: 'related_to',
};

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

function tail(value: string): string {
  const trimmed = value.trim().replace(/^ontology\//, '');
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function matchesRef(value: string, targetSlug: string): boolean {
  const normalized = value.trim().replace(/^ontology\//, '');
  const target = targetSlug.trim().replace(/^ontology\//, '');
  if (normalized === target) return true;
  return slugify(tail(normalized)) === slugify(tail(target));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildOntologyRelationEditPlan({
  sourceSlug,
  targetSlug,
  fromRelation,
  fromTargetSlug,
  toRelation,
  why,
  frontmatter,
}: {
  sourceSlug: string;
  targetSlug: string;
  fromRelation: MeaningEditRelation | null;
  fromTargetSlug?: string | null;
  toRelation: MeaningEditRelation;
  why: string;
  frontmatter: Record<string, unknown>;
}): OntologyRelationEditPlan {
  const updates: Record<string, OntologyRelationFrontmatterUpdate> = {};
  const fields: OntologyChangeSet['fields'] = [];
  const sourceKey = fromRelation ? RELATION_FRONTMATTER_KEY[fromRelation] : null;
  const targetKey = RELATION_FRONTMATTER_KEY[toRelation];
  const previousTarget = fromRelation ? (fromTargetSlug ?? targetSlug) : null;
  const relationKeys = [...new Set([sourceKey, targetKey].filter((key): key is string => Boolean(key)))];
  const nextRelations = Object.fromEntries(
    relationKeys.map((key) => [key, refs(frontmatter[key])]),
  ) as Record<string, string[]>;

  if (
    sourceKey &&
    previousTarget &&
    (sourceKey !== targetKey || !matchesRef(previousTarget, targetSlug))
  ) {
    nextRelations[sourceKey] = nextRelations[sourceKey].filter(
      (entry) => !matchesRef(entry, previousTarget),
    );
  }
  if (!nextRelations[targetKey].some((entry) => matchesRef(entry, targetSlug))) {
    nextRelations[targetKey] = [...nextRelations[targetKey], targetSlug];
  }
  for (const key of relationKeys) {
    const before = refs(frontmatter[key]);
    const after = nextRelations[key];
    if (!sameValue(before, after)) {
      updates[key] = after;
      fields.push({ key, before, after });
    }
  }

  const trimmedWhy = why.trim();
  const beforeNotes =
    frontmatter.relation_notes &&
    typeof frontmatter.relation_notes === 'object' &&
    !Array.isArray(frontmatter.relation_notes)
      ? Object.fromEntries(
          Object.entries(frontmatter.relation_notes as Record<string, unknown>).flatMap(
            ([key, value]) => (typeof value === 'string' ? [[key, value]] : []),
          ),
        )
      : {};
  const afterNotes = { ...beforeNotes };
  if (previousTarget && !matchesRef(previousTarget, targetSlug)) {
    for (const key of Object.keys(afterNotes)) {
      if (matchesRef(key, previousTarget)) delete afterNotes[key];
    }
  }
  if (trimmedWhy) afterNotes[targetSlug] = trimmedWhy;
  if (!sameValue(beforeNotes, afterNotes)) {
    updates.relation_notes = afterNotes;
    fields.push({ key: 'relation_notes', before: beforeNotes, after: afterNotes });
  }

  return {
    updates,
    changeSet: {
      toolName: 'patch_concept',
      operation: 'relate',
      target: sourceSlug,
      exact: true,
      destructive: false,
      relation: {
        from: sourceSlug,
        type: RELATION_EDGE_TYPE[toRelation],
        to: targetSlug,
        ...(trimmedWhy ? { why: trimmedWhy } : {}),
      },
      fields,
      itemCount: 1,
      items: [{
        key: `patch_concept:0:${sourceSlug}`,
        target: sourceSlug,
        exact: true,
        relation: {
          from: sourceSlug,
          type: RELATION_EDGE_TYPE[toRelation],
          to: targetSlug,
          ...(trimmedWhy ? { why: trimmedWhy } : {}),
        },
        fields,
      }],
    },
  };
}

export function buildOntologyRelationRemovalPlan({
  sourceSlug,
  targetSlug,
  relation,
  frontmatter,
}: {
  sourceSlug: string;
  targetSlug: string;
  relation: MeaningEditRelation;
  frontmatter: Record<string, unknown>;
}): OntologyRelationEditPlan {
  const updates: Record<string, OntologyRelationFrontmatterUpdate> = {};
  const fields: OntologyChangeSet['fields'] = [];
  const relationKey = RELATION_FRONTMATTER_KEY[relation];
  const before = refs(frontmatter[relationKey]);
  const after = before.filter((entry) => !matchesRef(entry, targetSlug));
  if (!sameValue(before, after)) {
    updates[relationKey] = after;
    fields.push({ key: relationKey, before, after });
  }

  const stillLinked = [...new Set(Object.values(RELATION_FRONTMATTER_KEY))].some((key) => {
    const values = key === relationKey ? after : refs(frontmatter[key]);
    return values.some((entry) => matchesRef(entry, targetSlug));
  });
  const beforeNotes =
    frontmatter.relation_notes &&
    typeof frontmatter.relation_notes === 'object' &&
    !Array.isArray(frontmatter.relation_notes)
      ? Object.fromEntries(
          Object.entries(frontmatter.relation_notes as Record<string, unknown>).flatMap(
            ([key, value]) => (typeof value === 'string' ? [[key, value]] : []),
          ),
        )
      : {};
  if (!stillLinked) {
    const afterNotes = Object.fromEntries(
      Object.entries(beforeNotes).filter(([key]) => !matchesRef(key, targetSlug)),
    );
    if (!sameValue(beforeNotes, afterNotes)) {
      updates.relation_notes = afterNotes;
      fields.push({ key: 'relation_notes', before: beforeNotes, after: afterNotes });
    }
  }

  return {
    updates,
    changeSet: {
      toolName: 'patch_concept',
      operation: 'remove',
      target: sourceSlug,
      exact: true,
      destructive: true,
      relation: {
        from: sourceSlug,
        type: RELATION_EDGE_TYPE[relation],
        to: targetSlug,
      },
      fields,
      itemCount: 1,
      items: [{
        key: `patch_concept:0:${sourceSlug}`,
        target: sourceSlug,
        exact: true,
        relation: {
          from: sourceSlug,
          type: RELATION_EDGE_TYPE[relation],
          to: targetSlug,
        },
        fields,
      }],
    },
  };
}
