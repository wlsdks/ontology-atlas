import { slugify } from "./slugify";

/**
 * Canonicalize a `domain:` frontmatter reference to ONE form: **the domain document's own
 * address** (`domains/inquiry-processing`).
 *
 * WHY (C7, 2026-07-25): two web writers produced different serializations of the same
 * domain, and any analytics keyed on the raw frontmatter string split one domain into two.
 *
 * **Why the canonical form is folder-qualified now** (2026-09-26, map-edit QA D10). C7 chose
 * the bare tail (`inquiry-processing`) because "the entire existing dogfood vault" used it.
 * That premise no longer holds: the dogfood vault the product rebuilt for itself writes
 * `domain: domains/<name>` on 93 of 93 nodes, every agent write through MCP `add_concept`
 * passes the domain's slug the construction card asks for (`domains/x`), and the docs page's
 * own quick patch writes the domain document's slug. The map's "add under this domain" was the
 * one writer still stripping the folder, so the same relation had two spellings in one vault.
 *
 * So a value that names its folder keeps it — a picker hands in the domain document's own
 * address, and that is the spelling that resolves exactly (`compile()` aliases a node by its
 * path, its tail and its declared `slug:`). A bare value stays bare: rewriting `auth` to
 * `domains/auth` would point at a path that may not exist when the domain lives at the vault
 * root. Only the last segment is slugified (Korean-preserving, spaces → hyphens), so
 * hand-typed `domains/inquiry processing` lands as `domains/inquiry-processing`. Returns ""
 * for empty or whitespace input.
 */
export function canonicalizeDomainRef(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/i, "");
  if (!trimmed) return "";
  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tailRaw = segments.pop() ?? trimmed;
  const tail = slugify(tailRaw).replace(/^-+|-+$/g, "") || tailRaw;
  return segments.length > 0 ? `${segments.join("/")}/${tail}` : tail;
}
