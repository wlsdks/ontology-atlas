/**
 * Maps Project ↔ vault frontmatter. The frontmatter parser has no inline objects, so `position`
 * is split into `positionX` / `positionY`.
 */

import type { Project, ProjectInput } from '@/entities/project';
import { generateNodeUid } from './build-vault-markdown';

/** Starter display names from the `init` template; only these follow a rename, never a user's own. */
const STARTER_PROJECT_DISPLAY_VALUES: ReadonlySet<string> = new Set([
  '내 프로젝트',
  'My project',
]);

/** The starter body summary, treated as unfilled so quick edit shows a placeholder. */
const STARTER_PROJECT_DESCRIPTION_MARKERS: readonly string[] = [
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

/** `display_<locale>` updates for keys still at a starter default. */
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

/** The serializable subset shared by `Project` and `ProjectInput`. */
export interface ProjectFrontmatterShape {
  slug: string;
  name: string;
  // Optional so both `Project` (vault-honest) and `ProjectInput` (required) assign.
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

// Proves only that FM fields exist on `Project`; a new `Project` field needs its own serialization.
type _ProjectAssignable = Project extends ProjectFrontmatterShape ? true : false;
type _ProjectInputAssignable = ProjectInput extends ProjectFrontmatterShape ? true : false;
const _projectCheck: _ProjectAssignable = true;
const _projectInputCheck: _ProjectInputAssignable = true;
void _projectCheck;
void _projectInputCheck;

/** Empty values are omitted; the serializer deletes only on `null`. */
export function projectToFrontmatter(
  project: ProjectFrontmatterShape,
): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  // `kind` is always normalized so writes keep the graph-node contract.
  out.kind = 'project';
  out.name = project.name;
  out.slug = project.slug;
  // An unset category stays absent rather than fabricated.
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
  if (project.position) {
    out.positionX = project.position.x;
    out.positionY = project.position.y;
  }
  return out;
}

/** Full markdown for `createDoc`. */
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
 * Newline and quote characters force quoting, and newlines are escaped (`unquote` restores
 * them), or a value could inject keys. Four writers must agree on this rule.
 */
function needsQuote(s: string): boolean {
  if (/[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s)) return true;
  // Boolean- and number-shaped strings are quoted, or they read back retyped.
  return s === 'true' || s === 'false' || (s !== '' && !Number.isNaN(Number(s)));
}

/** Folds newlines to the two-character `\n` escape. */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
