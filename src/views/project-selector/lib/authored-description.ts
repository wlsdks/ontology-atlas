import type { VaultDoc } from "@/entities/docs-vault";
import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/**
 * The only description that may reach the screen is **what a person wrote as a description** — a body
 * excerpt is not a description.
 *
 * `Project.description` (`derive-projects-from-vault.ts`) and `KnowledgeGraphNode.summary`
 * (`derive-ontology-from-vault.ts`) both fall back to `doc.excerpt` (the first ~320 characters of the
 * body) when frontmatter has no `description:`. That is reasonable as a general entity-layer fallback,
 * but passed straight to a decision screen it seats internal memos, strategy copy, retired component
 * names, and mid-word ellipses on a card purely because they happened to be at the top of the file.
 * Two measurements:
 * - The dogfood `docs/ontology/project.md` card led with contributor-facing text starting
 *   "Identity (2026-07): agent-native, human-sovereign …".
 * - `/ko/projects` "recent activity" emitted `VaultAgentSetupPanel (merged into AppSettingsMenu's
 *   vault / mcpAgents t…` as one row.
 *
 * **This verdict is made in exactly one place.** Two consumers implementing the same rule means only one
 * gets fixed (measured 2026-07-26: the card was fixed while recent activity on the same page was not),
 * and one screen states the same fact two ways. Both the card body and the recent-activity row pass
 * through this function.
 *
 * **And it ends where the sentence ends.** Both consumers draw one line, so a paragraph-length
 * `description:` was cut by the clamp at whatever pixel the row ran out of — the storefront sample read
 * "…out of a singl…" on the list (measured 2026-09-20 at 1512). The project hero has refused that since
 * 2026-07-26 through `compactOntologyDescription`, which takes the first sentence and never cuts
 * mid-clause; the list is the screen whose whole job is identification, so it holds the same rule rather
 * than a weaker one. The CSS clamp stays as the last resort for a first sentence longer than a row.
 */
export function resolveAuthoredDescription(doc: VaultDoc | null | undefined): string | null {
  const raw = doc?.frontmatter?.description;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return compactOntologyDescription(trimmed) ?? null;
}
