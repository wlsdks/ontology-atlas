import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/** One whole first sentence; the hero column fits 320 in three lines at 1512 (measured). */
const TAGLINE_MAX_CHARS = 320;

export interface ProjectTaglineSource {
  description?: string | null;
  /** The body's first paragraph; the fallback. */
  excerpt?: string | null;
}

/**
 * Ends at a sentence boundary, never mid-word; with nothing to say it returns undefined rather
 * than inventing a definition, which belongs to the vault.
 */
export function resolveProjectTagline(
  source: ProjectTaglineSource,
): string | undefined {
  return (
    compactOntologyDescription(source.description, TAGLINE_MAX_CHARS) ??
    compactOntologyDescription(source.excerpt, TAGLINE_MAX_CHARS)
  );
}
