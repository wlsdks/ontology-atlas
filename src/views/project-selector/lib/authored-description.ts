import type { VaultDoc } from "@/entities/docs-vault";
import type { Project } from "@/entities/project";
import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/**
 * Only what a person wrote as a description reaches the screen, never the entity layer's excerpt
 * fallback (`doc.excerpt`), which seats memos on cards. The one rule for the card body and the
 * recent-activity row, cut at the first sentence like the hero (`compactOntologyDescription`).
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
 * The body's first sentence only when it names the project (title or any display name), the
 * shape of the definition the construction card asks for; a memo names nothing and is refused.
 */
function resolveBodyDefinition(
  doc: VaultDoc | null | undefined,
  project?: Pick<Project, "name" | "displayNames"> | null,
): string | null {
  if (!doc || !project) return null;
  // 320 is the excerpt's own length, so the whole first sentence fits.
  const sentence = compactOntologyDescription(doc.excerpt, 320);
  // A sentence that does not end inside the excerpt is a cut, not a definition.
  if (!sentence || !/[.!?。！？]$/u.test(sentence)) return null;
  const names = [project.name, doc.title, ...Object.values(project.displayNames ?? {})]
    .map((name) => (typeof name === "string" ? name.trim().toLowerCase() : ""))
    .filter((name) => name.length > 0);
  const opening = sentence.toLowerCase();
  return names.some((name) => opening.startsWith(name)) ? sentence : null;
}
