import { slugify } from "./slugify";

/**
 * Canonicalize a `domain:` frontmatter reference to ONE form (C7).
 *
 * WHY: two writers produced different serializations of the same domain — the
 * map "새 노드" form wrote the folder-prefixed picker value (`domains/문의-처리`)
 * while the studio CREATE form wrote the bare tail-slug (`문의-처리`). Both resolve
 * to the same node in the compiler/derivation, but any analytics that key on the
 * raw frontmatter string aggregate them as two different domains.
 *
 * Canonical form = the bare tail-slug (`문의-처리`). This matches the entire
 * existing dogfood vault (every `domain:` there is a bare slug), the studio writer,
 * and what the derivation resolves to — so routing every NEW write through this
 * needs zero rewrite of existing files.
 *
 * Rules: drop a leading folder prefix (`domains/…`, or any `…/`), then slugify
 * the tail (Korean-preserving, spaces→hyphens) so hand-typed values like
 * "문의 처리" land as `문의-처리`. Returns "" for empty/whitespace input.
 */
export function canonicalizeDomainRef(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  const tail = trimmed.split("/").pop() ?? trimmed;
  const slug = slugify(tail).replace(/^-+|-+$/g, "");
  return slug || tail;
}
