/**
 * Derive a short display title. Pure — vault frontmatter is never touched.
 *
 * Some dogfood vault titles carry a 40-word parenthetical (for example
 * `capabilities/cli-developer-entry` is "CLI Developer Entry (49 commands — vault
 * + MCP verify + ...)"). Drawn verbatim, those titles clutter and truncate the
 * topology label, the index panel row, the node popover and the detail header —
 * a core readability problem for non-developers.
 *
 * Priority:
 *   (a) the frontmatter `display:` field, when present — an explicit short name
 *       the user chose wins over anything derived;
 *   (b) the part before the first " (" — cut the parenthetical;
 *   (c) the title unchanged, when there is neither.
 *
 * There is deliberately no maximum length: rule (b) already covers the real cases
 * (a long title is almost always "short name (explanation)"). A narrow surface
 * that does need a hard cap takes this function's output and truncates further
 * (see `views/project-detail/model/short-domain-title.ts` — same parenthesis rule
 * plus a MAX_LENGTH ellipsis).
 *
 * **Never use this for search or matching.** Matching (`matchOntologyNodes` and
 * friends) must keep running against the full original title; this is for
 * rendering surfaces only.
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
