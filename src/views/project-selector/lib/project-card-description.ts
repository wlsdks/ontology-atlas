import type { VaultDoc } from "@/entities/docs-vault";

/**
 * The /projects card body should show only a description the user
 * deliberately wrote — never an auto-generated excerpt.
 *
 * `Project.description` (`derive-projects-from-vault.ts`) falls back to
 * `doc.excerpt` (the first ~320 stripped characters of the whole document
 * body) whenever frontmatter has no explicit `description:` key. That
 * fallback is reasonable for the entity layer in general, but it means any
 * project card can end up showing internal notes, strategy language, or
 * scratch prose that just happened to be first in the file — this repo's
 * own dogfood `docs/ontology/project.md` is a live example (no
 * `description:` key, so the card fell back to an excerpt that opened with
 * "정체성 (2026-07): agent-native, human-sovereign..." positioning copy
 * meant for contributors reading the file, not workspace visitors scanning
 * cards). This helper reads the vault doc's own frontmatter directly so the
 * card only ever shows what was written *as* a description.
 */
export function resolveProjectCardDescription(doc: VaultDoc | null | undefined): string | null {
  const raw = doc?.frontmatter?.description;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
