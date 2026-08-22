import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/** The maximum length of the hero's one-line definition — the bound that fits within two lines. */
const TAGLINE_MAX_CHARS = 160;

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
 * sentence cut mid-word — "…이 프로젝트의 ontology 는 비즈니". A paragraph-length text pushed into the
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
