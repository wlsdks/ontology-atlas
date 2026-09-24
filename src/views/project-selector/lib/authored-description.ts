import type { VaultDoc } from "@/entities/docs-vault";
import type { Project } from "@/entities/project";
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
export function resolveAuthoredDescription(
  doc: VaultDoc | null | undefined,
  project?: Pick<Project, "name" | "displayNames"> | null,
): string | null {
  const raw = doc?.frontmatter?.description;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return compactOntologyDescription(raw.trim()) ?? null;
  }
  return resolveBodyDefinition(doc, project);
}

/**
 * **The body's definition sentence, when the body opens with one** (2026-09-25).
 *
 * The construction card asks every node for "a definition sentence in the body", and the dogfood
 * `ontology-atlas.md` carries exactly that and no `description:` key. The project page's hero drew
 * the sentence while this list said "no description yet" — one project, two answers, on the flagship.
 *
 * The rule above still holds for everything else: a body excerpt is not a description. What is
 * accepted is narrower than "the excerpt" — the first sentence, and only when it **names the
 * project** (its canonical title or any `display_<locale>`), the shape "Ontology Atlas is …" a
 * definition has. A memo that happens to open the file ("Identity (2026-07): …") names nothing and
 * still falls back to the honest "no description yet".
 */
function resolveBodyDefinition(
  doc: VaultDoc | null | undefined,
  project?: Pick<Project, "name" | "displayNames"> | null,
): string | null {
  if (!doc || !project) return null;
  // The whole first sentence (320 is the excerpt's own length): a 160 cap closed the flagship's
  // definition on "…and what..." mid-clause, and the card's three-line clamp is the last resort.
  const sentence = compactOntologyDescription(doc.excerpt, 320);
  // A sentence that does not end inside the excerpt is a cut, not a definition.
  if (!sentence || !/[.!?。！？]$/u.test(sentence)) return null;
  const names = [project.name, doc.title, ...Object.values(project.displayNames ?? {})]
    .map((name) => (typeof name === "string" ? name.trim().toLowerCase() : ""))
    .filter((name) => name.length > 0);
  const opening = sentence.toLowerCase();
  return names.some((name) => opening.startsWith(name)) ? sentence : null;
}
