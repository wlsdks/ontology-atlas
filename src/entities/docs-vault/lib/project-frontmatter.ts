/**
 * Bidirectional mapper between the Project entity and vault frontmatter.
 *
 * - read: `mapFrontmatterToProject` turns `projects/*.md` into a `Project`
 * - write: `projectToFrontmatter` produces a frontmatter object from a `Project`
 *   or `ProjectInput`, serializable straight through the local vault's
 *   createDoc / updateDoc (`apply-frontmatter-updates` compatible)
 *
 * Our frontmatter parser (`shared/lib/parse-frontmatter`) has no inline-object
 * support, so `position` is split into `positionX` / `positionY`. Every other
 * field is string, number, boolean, or string[].
 */

import type { Project, ProjectInput } from '@/entities/project';
import { generateNodeUid } from './build-vault-markdown';

/**
 * Starter `display_<locale>` values shipped by the `node $ATLAS/cli/src/index.mjs init`
 * project template (`ontology-starter.ts` PROJECT_MD). C6 — these are treated
 * as "never customized": when a project is renamed while its display name still
 * equals one of these, the display key is auto-filled from the new title so the
 * map/INDEX don't keep showing "내 프로젝트" / "My project" after a rename.
 * A user who set their own display name is NOT in this set, so their choice is
 * never overwritten.
 */
export const STARTER_PROJECT_DISPLAY_VALUES: ReadonlySet<string> = new Set([
  '내 프로젝트',
  'My project',
]);

/**
 * Starter project body summary shipped by `node $ATLAS/cli/src/index.mjs init` (PROJECT_MD).
 * With no `description:` frontmatter the derived `Project.description` falls back
 * to the body excerpt — this English boilerplate. #9 — quick-edit treats it as
 * "never filled in" so it renders as a placeholder (empty value), not a real
 * value the user has to delete before writing a real one-liner.
 */
export const STARTER_PROJECT_DESCRIPTION_MARKERS: readonly string[] = [
  'Write a one- or two-line summary of your project here',
  '프로젝트를 한두 줄로 요약',
];

export function isStarterProjectDescription(
  description: string | null | undefined,
): boolean {
  if (!description) return false;
  const trimmed = description.trim();
  return STARTER_PROJECT_DESCRIPTION_MARKERS.some((marker) =>
    trimmed.startsWith(marker),
  );
}

/**
 * Given the existing frontmatter and a new project name, compute the
 * `display_<locale>` updates needed so stale STARTER display names track the
 * rename. Returns only the keys that are currently at a starter default (empty
 * object when there's nothing to sync). C6.
 */
export function buildStarterDisplaySync(
  existingFrontmatter: Record<string, unknown>,
  newName: string,
): Record<string, string> {
  const trimmed = newName.trim();
  if (!trimmed) return {};
  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingFrontmatter)) {
    if (!/^display_[a-z]{2}$/.test(key)) continue;
    if (typeof value !== 'string') continue;
    if (STARTER_PROJECT_DISPLAY_VALUES.has(value.trim())) {
      updates[key] = trimmed;
    }
  }
  return updates;
}

/**
 * The *optional* field shape used for serialization. `Project` and `ProjectInput`
 * do not match exactly (position is required on one of them), so serialization
 * only needs to see the common subset.
 */
export interface ProjectFrontmatterShape {
  slug: string;
  name: string;
  // `Project` is honest to the vault, so `category` is optional there;
  // `ProjectInput` requires it form-locally. Optional lets both assign.
  category?: string;
  status?: string;
  description?: string;
  detail?: string;
  tags?: string[];
  stack?: string[];
  dependencies?: string[];
  owner?: string;
  icon?: string;
  isHub?: boolean;
  position?: { x: number; y: number };
}

// Compile-time sanity: `Project` and `ProjectInput` must still extend
// ProjectFrontmatterShape. Note this only proves every FM field exists on
// `Project` — a new field on `Project` is not added to FM automatically, so a
// serialization gap needs its own check.
type _ProjectAssignable = Project extends ProjectFrontmatterShape ? true : false;
type _ProjectInputAssignable = ProjectInput extends ProjectFrontmatterShape ? true : false;
const _projectCheck: _ProjectAssignable = true;
const _projectInputCheck: _ProjectInputAssignable = true;
void _projectCheck;
void _projectInputCheck;

/**
 * Project → vault frontmatter object. Empty and undefined values are omitted;
 * our serializer treats only `null` as a delete, so skipping is enough.
 */
export function projectToFrontmatter(
  project: ProjectFrontmatterShape,
): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  // Every input here comes from an already-typed write path (Project/ProjectInput).
  // Normalizing `kind` keeps new documents and full edits from losing the graph-node
  // contract.
  out.kind = 'project';
  out.name = project.name;
  out.slug = project.slug;
  // `category` is optional, so an unset one is omitted from the frontmatter too —
  // the vault is the source of truth and must not fabricate information it lacks.
  if (project.category) out.category = project.category;
  if (project.status) out.status = project.status;
  if (project.description?.trim()) out.description = project.description;
  if (project.detail?.trim()) out.detail = project.detail;
  if (project.tags && project.tags.length > 0) out.tags = project.tags;
  if (project.stack && project.stack.length > 0) out.stack = project.stack;
  if (project.dependencies && project.dependencies.length > 0) {
    out.dependencies = project.dependencies;
  }
  if (project.owner?.trim()) out.owner = project.owner;
  if (project.icon?.trim()) out.icon = project.icon;
  if (project.isHub) out.isHub = true;
  // `position` is split across two keys because the frontmatter parser cannot read inline objects.
  if (project.position) {
    out.positionX = project.position.x;
    out.positionY = project.position.y;
  }
  return out;
}

/**
 * Project frontmatter → raw markdown including the frontmatter block, used as
 * `createDoc`'s initial content.
 */
export function buildProjectMarkdown(
  project: ProjectFrontmatterShape,
  options: { body?: string; uid?: string } = {},
): string {
  const fm = projectToFrontmatter(project);
  const fmLines = Object.entries({ uid: generateNodeUid(options.uid), ...fm }).map(
    ([k, v]) => `${k}: ${serializeValue(v)}`,
  );
  const body = options.body?.trim() || `# ${project.name}\n`;
  return `---\n${fmLines.join('\n')}\n---\n\n${body}`;
}

function serializeValue(v: string | number | boolean | string[]): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${escapeQuoted(s)}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

/*
 * Does this value need quoting — **four places must agree on the answer.**
 *
 * Reviewed and reproduced 2026-08-16: newline was missing from the rule. That one
 * character destroys the whole frontmatter block — `note\nkind: element` **changes
 * the node's kind**, and `note\n---\nx: 1` ends the frontmatter there, dropping the
 * remaining keys into the body. Silently, with no warning.
 *
 * Quoting alone does not help once the line is already broken, so the writer
 * escapes to `\n` and the reader restores it (`unquote`).
 *
 * The single quote joined the rule too: `unquote` strips unmatched quotes from both
 * ends, so an unquoted value like `'지도'` reads back as `지도`.
 */
function needsQuote(s: string): boolean {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s);
}

/** Makes a value safe inside quotes — newlines fold to `\n`. */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
