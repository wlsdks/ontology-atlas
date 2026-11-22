import type { Project } from '../model/project';

/**
 * `display_<locale>` when present, else the canonical `title`/`name`, so every screen names a
 * project by the same word the map draws. The canonical name still identifies the document.
 */
export function projectDisplayName(
  project: Pick<Project, 'name' | 'displayNames'>,
  locale: string,
): string {
  const display = project.displayNames?.[locale]?.trim();
  return display && display.length > 0 ? display : project.name;
}

export function projectHasDisplayName(
  project: Pick<Project, 'displayNames'>,
  locale: string,
): boolean {
  const display = project.displayNames?.[locale]?.trim();
  return Boolean(display && display.length > 0);
}

/** Two lowercase letters after `display_`, as `buildStarterDisplaySync` matches. */
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
