/**
 * Derives a short display title; vault frontmatter is never touched. Some vault titles carry a long
 * parenthetical that clutters and truncates labels. Priority: (a) the frontmatter `display:` field,
 * an explicit short name; (b) the part before the first " ("; (c) the title unchanged.
 * There is no maximum length: a narrow surface that needs a cap truncates this output further
 * (`views/project-detail/model/short-domain-title.ts`). Never use this for search or matching, which
 * must run against the full original title (`matchOntologyNodes`).
 */
export function deriveDisplayTitle(
  frontmatter: Record<string, unknown> | null | undefined,
  title: string,
): string {
  const display =
    frontmatter && typeof frontmatter.display === "string"
      ? frontmatter.display.trim()
      : "";
  if (display) return display;

  const parenIndex = title.indexOf(" (");
  if (parenIndex > 0) return title.slice(0, parenIndex).trim();

  return title;
}
