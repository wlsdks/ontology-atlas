import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { buildDocLinkMarkdown } from './relative-doc-path';

/**
 * The editor's `@` mention — **choosing creates a relation.**
 *
 * ## Why this was needed (measured 2026-08-08)
 *
 * The old editor's only assistance was `[[` wikilink autocomplete. But a body
 * wikilink **does not change one bit of the compiled graph** — adding and removing
 * one in the same vault left the edge count and the graph hash identical (9 ·
 * `c07785b6`), because the graph reads only frontmatter keys.
 *
 * So the person believes they connected something while the map has no line, and
 * path-finding and impact analysis do not see it either. The dogfood vault shows
 * where that ends: **0 body wikilinks** against 154 frontmatter relations. We do
 * not use it ourselves.
 *
 * (Strictly, `find_backlinks` alone scans bodies too and reports those
 * **distinctly** as `matchedInBody`. The data model already knew about "two kinds
 * of connection"; only the editor was not saying so.)
 *
 * ## What it does
 *
 * Pick a node with `@`, pick a relation, and:
 *
 * 1. **The relation is written to frontmatter** — this is the fact. It becomes a
 *    line on the map, and path, impact and agent handoff all read it.
 * 2. **A standard markdown link is left in the body** — `[name](../path.md)`. That
 *    is not a fact but **a route for the reader**.
 *
 * This is not «two places stating the same fact». One is a typed fact, the other
 * is prose you can click through.
 *
 * ## Why the body notation is a standard link (2026-08-08, two owner reports)
 *
 * **First version**: plain names only. Owner — *"If @ registers something, shouldn't the prose show
 * it in some form too?"* (if @ registers something, shouldn't the prose show
 * it in some form too?). Right — plain text looks as though nothing happened, and
 * then the result of the action just taken is not on screen.
 *
 * **Second version**: wikilinks (`[[slug|name]]`). Owner — *"Isn't `[[` an Obsidian thing we
 * shouldn't use?"* (isn't `[[` an Obsidian thing we
 * shouldn't use?). Also a fair point. Wikilinks are a PKM convention from MediaWiki
 * (2001) rather than an Obsidian invention, but **the impression is Obsidian**.
 *
 * **So a syntax of our own?** No — that is worse. Our notation would be
 * **unidentifiable characters** in Obsidian, GitHub, VS Code and every markdown
 * viewer, and that would be us breaking this product's promise that everything can
 * be carried out as plain markdown. Not their syntax, not ours: **the markdown
 * standard**.
 *
 * Measured, the standard link wins on every axis — above all it **renders on
 * GitHub** (a wikilink is broken text there). "A wikilink survives file moves
 * because it is a slug" is also wrong: `redirectBacklinks` only fixes frontmatter
 * and never touches bodies (measured), so both notations are equal on that axis.
 * Comparison table: `lib/relative-doc-path.ts`.
 *
 * This does not contradict removing the `[[` **input syntax** earlier. What was
 * removed was «pretending a body link completes a connection»; what is used now is
 * **a notation that lets a person click through a relation after it has been
 * written**. The fact lives in the frontmatter.
 *
 * ## Why a pure function
 *
 * The editor edits **the whole source including frontmatter** in a textarea, so
 * this feature needs no new save path — it is one buffer-string transform. With no
 * side effects, the relation array's canonical rule (dedupe plus sort) can be
 * tested without a browser.
 */

/** What an `@` trigger caught — the query before the caret and where it started. */
export interface MentionTrigger {
  query: string;
  start: number;
}

/**
 * Find the `@query` immediately before the caret.
 *
 * The opening conditions are narrow, because **with no match it has to stay a
 * plain character silently**. With a local vault open, the docs vault can edit
 * `CLAUDE.md` and `AGENTS.md`, and in those files `@AGENTS.md` is **real import
 * syntax** — a menu intruding there hijacks someone else's syntax.
 *
 * So three things are required: ① the `@` is at line start or preceded by
 * whitespace (so an `@` inside an email or handle is not caught), ② the query has
 * no line break, and ③ the query does not start with `/` or `.` (so path notation
 * like `@docs/…` and `@AGENTS.md` is stepped around).
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
   * It withdraws **the moment** a `/` or `.` enters the query. Checking only the
   * first character would leave the menu open through `@docs` while typing
   * `@docs/…` and then vanish at the slash. That flicker reads as an attempted
   * hijack, and above all an Enter in between turns someone else's syntax into a
   * node name.
   */
  if (/[/.]/.test(query)) return null;
  return { query, start: caret - (back.length - at) };
}

/**
 * Relation bearings — **the same vocabulary** as the studio's compass.
 *
 * If two screens doing the same job (creating a relation) use different words, the
 * user learns them as two different features. The frontmatter keys used here are
 * exactly the studio's too — no new key is minted (the schema is owned solely by
 * `mcp/src/schema.mjs`).
 */
export const MENTION_RELATIONS = [
  { id: 'broader', frontmatterKey: 'broader' },
  { id: 'contains', frontmatterKey: 'contains' },
  { id: 'dependencies', frontmatterKey: 'dependencies' },
  { id: 'relates', frontmatterKey: 'relates' },
] as const;

export type MentionRelationId = (typeof MENTION_RELATIONS)[number]['id'];

/**
 * Relation id → **the studio's label key.** No copy is minted here — the studio
 * already has "Superior Concept · Required Item · Sub-item · Related Item", and two screens
 * using different words for the same job teaches the user two features.
 */
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
 * The canonical shape of a relation array — **deduplicated plus `localeCompare`
 * sorted.**
 *
 * The rule is not redefined here. `non-canonical-graph-array` in
 * `validate-vault-document.ts` already requires that shape, and writing it
 * differently would make the file we just wrote raise a warning in our own check.
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
 * **Write the node chosen with `@` as a relation, and leave its name in the body.**
 *
 * `content` is the whole source including frontmatter; `caret` is an absolute
 * position within it.
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
   * The slug of **the document being edited** — the base point for the relative
   * path.
   *
   * While it was named `currentSlug`, a call site actually got it wrong
   * (2026-08-08): `const { doc, trigger } = pendingMention` shadowed the
   * component's `doc` (the document being edited), so `currentSlug: doc.slug`
   * passed **the chosen target**. The base and destination then match and the link
   * comes out as `./same-folder.md` — caught by measurement. Renaming it to
   * `editingSlug` makes «the one being edited» and «the one chosen» visibly
   * distinct at that call site.
   */
  editingSlug: string;
  trigger: MentionTrigger;
  target: { slug: string; title: string };
  relationId: MentionRelationId;
}): MentionInsertResult {
  const key = RELATION_KEY_BY_ID.get(relationId);
  if (!key) throw new Error(`Unknown relation: ${relationId}`);
  /*
   * **A node cannot link to itself.** `broader: [itself]` is a meaningless relation
   * and a self-referencing edge to the compiler. The screen also removes the current
   * document from the list (that is the real fix), but it is blocked here too —
   * because the bug above, where base and destination match, **would have hit this
   * assertion first**. An API that is hard to misuse beats a comment.
   */
  if (editingSlug === target.slug) {
    throw new Error(
      'insertMentionRelation: editingSlug and target.slug are the same document — ' +
        'a node cannot relate to itself. Exclude the editing doc from the candidate list.',
    );
  }

  // ① Body — replace `@query` with a **standard markdown link**. Our viewer,
  //    Obsidian, GitHub and VS Code all read it as a link (see "why a standard link").
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
   * ⚠️ **Change the body first, write the frontmatter second.** In the reverse
   * order, the string `applyFrontmatterUpdates` returns has a different frontmatter
   * length, so the body offset (`trigger.start`) is wrong. That does not merely put
   * the caret somewhere odd — it **cuts characters from the wrong place**.
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
