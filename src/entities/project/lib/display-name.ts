import type { Project } from '../model/types';

/**
 * The name a person reads for a project on this screen: `display_<locale>` when the document
 * carries one, otherwise the canonical `title`/`name`.
 *
 * One thing, one word (owner, 2026-08-25). The map, the INDEX and the Library already draw a
 * node by its `display_<locale>` (`KnowledgeGraphNode.display`), so on a Korean screen the
 * sample project is its Korean word there. The projects list and the project page read
 * `Project.name`, the canonical title, and said "Online Store" for the same file on the same
 * screen (measured 2026-09-19). Every place that names a project now asks this function, so
 * the four screens agree on the word.
 *
 * The canonical name is still what identifies the document (search, slugs, the frontmatter
 * `title`); this only decides what is drawn.
 */
export function projectDisplayName(
  project: Pick<Project, 'name' | 'displayNames'>,
  locale: string,
): string {
  const display = project.displayNames?.[locale]?.trim();
  return display && display.length > 0 ? display : project.name;
}

/** Whether this screen's word for the project comes from a `display_<locale>` key. */
export function projectHasDisplayName(
  project: Pick<Project, 'displayNames'>,
  locale: string,
): boolean {
  const display = project.displayNames?.[locale]?.trim();
  return Boolean(display && display.length > 0);
}

/**
 * Reads every `display_<locale>` key off a document's frontmatter. Keys are two lowercase
 * letters after the underscore, the same shape `buildStarterDisplaySync` matches; anything
 * else is not a display name.
 */
export function readDisplayNames(
  frontmatter: Record<string, unknown>,
): Record<string, string> | undefined {
  let out: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(frontmatter)) {
    const match = /^display_([a-z]{2})$/.exec(key);
    if (!match || typeof value !== 'string' || value.trim().length === 0) continue;
    out ??= {};
    out[match[1]] = value.trim();
  }
  return out;
}
