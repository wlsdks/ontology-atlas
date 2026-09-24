import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/**
 * The maximum length of the hero's definition — one whole first sentence. 160 closed the flagship's
 * 264-character definition on "…and what..." mid-clause (measured 2026-09-25); the hero's text column
 * is wide enough for 320 in three lines at 1512, so the bound is the excerpt's own length.
 */
const TAGLINE_MAX_CHARS = 320;

export interface ProjectTaglineSource {
  /** frontmatter `description:` — the one-line definition a person wrote themselves. */
  description?: string | null;
  /** An excerpt of the body's first paragraph — the fallback when there is no description. */
  excerpt?: string | null;
}

/**
 * The **one-line definition** to place in the project hero.
 *
 * Measured defect (2026-07-26): the hero passed a 320-character excerpt straight through and the
 * sentence cut mid-word — "…the ontology of this project is busi". A paragraph-length text pushed into the
 * meta row made up half of the "it feels cramped" impression.
 *
 * Two things are held:
 *
 * 1. **It ends at a sentence boundary.** `compactOntologyDescription` picks the first sentence and
 *    closes with an ellipsis when there is no punctuation — it never cuts off mid-clause.
 * 2. **Nothing is invented when there is none.** With both empty it returns `undefined` and the screen
 *    does not draw the description block at all. A one-line definition belongs to the vault and is not
 *    something the UI produces — which is what gives a user a reason to fill in `description:`.
 *
 * The full text and complete excerpt belong to the overview tab's body. The hero is the overview and the
 * body is the detail (Shneiderman: overview first, details on demand).
 */
export function resolveProjectTagline(
  source: ProjectTaglineSource,
): string | undefined {
  return (
    compactOntologyDescription(source.description, TAGLINE_MAX_CHARS) ??
    compactOntologyDescription(source.excerpt, TAGLINE_MAX_CHARS)
  );
}
