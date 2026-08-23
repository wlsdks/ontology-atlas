import type { VaultDoc } from "@/entities/docs-vault";

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
 */
export function resolveAuthoredDescription(doc: VaultDoc | null | undefined): string | null {
  const raw = doc?.frontmatter?.description;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
