import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { buildDocLinkMarkdown } from './relative-doc-path';

/**
 * The editor's `@` mention: choosing writes a relation to frontmatter (the fact the graph reads)
 * and leaves a standard markdown link in the body for readers (`[name](../path.md)`). A pure buffer
 * transform, so the canonical array rule is testable without a browser; link format reasons are
 * in `lib/relative-doc-path.ts`.
 */

/** What an `@` trigger caught — the query before the caret and where it started. */
export interface MentionTrigger {
  query: string;
  start: number;
}

/**
 * Find the `@query` right before the caret. The `@` must start a line or follow whitespace, the
 * query has no line break, and it must not start with `/` or `.`, or path imports like `@AGENTS.md`
 * in `CLAUDE.md` would be hijacked.
 */
export function detectMentionTrigger(source: string, caret: number): MentionTrigger | null {
  if (caret < 1 || caret > source.length) return null;
  const back = source.slice(Math.max(0, caret - 120), caret);
  const at = back.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? (caret - back.length === 0 ? '' : source[caret - back.length - 1]) : back[at - 1];
  if (before && !/\s/.test(before)) return null;
  const query = back.slice(at + 1);
  if (/[\n\r]/.test(query)) return null;
  /*
   * Withdraw as soon as a `/` or `.` enters the query, or an Enter mid-typing turns path syntax
   * into a node name.
   */
  if (/[/.]/.test(query)) return null;
  return { query, start: caret - (back.length - at) };
}

/**
 * Relation directions use the studio compass's vocabulary and frontmatter keys; the schema is owned
 * by `mcp/src/schema.mjs`.
 */
export const MENTION_RELATIONS = [
  { id: 'broader', frontmatterKey: 'broader' },
  { id: 'contains', frontmatterKey: 'contains' },
  { id: 'dependencies', frontmatterKey: 'dependencies' },
  { id: 'relates', frontmatterKey: 'relates' },
] as const;

export type MentionRelationId = (typeof MENTION_RELATIONS)[number]['id'];

/** Relation id to the studio's label key, so both screens use the same words. */
export const RELATION_LABEL_KEY: Record<MentionRelationId, string> = {
  broader: 'isA',
  contains: 'contains',
  dependencies: 'dependsOn',
  relates: 'relates',
};

const RELATION_KEY_BY_ID = new Map<string, string>(
  MENTION_RELATIONS.map((relation) => [relation.id, relation.frontmatterKey]),
);

/**
 * Canonical relation array: deduplicated and `localeCompare` sorted, as `non-canonical-graph-array`
 * in `validate-vault-document.ts` requires.
 */
function canonicalRefs(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export interface MentionInsertResult {
  /** The updated full source (frontmatter included). */
  content: string;
  /** Where the caret should sit after the insertion. */
  caret: number;
  /** Whether this insertion actually added a **new** relation (false if it already existed). */
  relationAdded: boolean;
}

/**
 * Write the `@` choice as a relation and leave its link in the body; `caret` is an absolute offset
 * into `content`.
 */
export function insertMentionRelation({
  content,
  editingSlug,
  trigger,
  target,
  relationId,
}: {
  content: string;
  /**
   * The slug of the document being edited, the base for the relative path; passing the chosen
   * target gives `./same-folder.md`.
   */
  editingSlug: string;
  trigger: MentionTrigger;
  target: { slug: string; title: string };
  relationId: MentionRelationId;
}): MentionInsertResult {
  const key = RELATION_KEY_BY_ID.get(relationId);
  if (!key) throw new Error(`Unknown relation: ${relationId}`);
  /*
   * A node cannot link to itself; the screen also hides the current document, but the API refuses
   * it too.
   */
  if (editingSlug === target.slug) {
    throw new Error(
      'insertMentionRelation: editingSlug and target.slug are the same document — ' +
        'a node cannot relate to itself. Exclude the editing doc from the candidate list.',
    );
  }

  // Body: replace `@query` with a standard markdown link.
  const inserted = buildDocLinkMarkdown({
    fromSlug: editingSlug,
    toSlug: target.slug,
    label: target.title,
  });
  const withLabel =
    content.slice(0, trigger.start) +
    inserted +
    content.slice(trigger.start + 1 + trigger.query.length);
  const caretAfterLabel = trigger.start + inserted.length;

  // ② Frontmatter — add the relation. If it is already there, the file is untouched.
  const { frontmatter } = parseFrontmatter(withLabel);
  const existingRaw = frontmatter[key];
  const existing = Array.isArray(existingRaw)
    ? existingRaw.filter((item): item is string => typeof item === 'string')
    : [];
  if (existing.some((ref) => ref.trim() === target.slug)) {
    return { content: withLabel, caret: caretAfterLabel, relationAdded: false };
  }
  const next = canonicalRefs([...existing, target.slug]);

  /*
   * Change the body first, then frontmatter; the reverse order invalidates `trigger.start` and cuts
   * the wrong characters.
   */
  const withRelation = applyFrontmatterUpdates(withLabel, { [key]: next });
  const grew = withRelation.length - withLabel.length;
  return {
    content: withRelation,
    // The body caret shifts back by however much the frontmatter grew.
    caret: caretAfterLabel + grew,
    relationAdded: true,
  };
}
