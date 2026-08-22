/**
 * Replaces only the prose body of a node's markdown, leaving the frontmatter block
 * untouched — the inverse of `parseFrontmatter`.
 *
 * A node's body *is* its description, so saving an edited description must preserve
 * the frontmatter (slug, kind, domain, relation keys) losslessly. The counterpart of
 * `applyFrontmatterUpdates`, which preserves the body and changes the frontmatter.
 *
 * With no frontmatter block (`---\n...\n---`) the whole file is body and is replaced
 * whole. Surrounding whitespace is trimmed and the result is serialised as
 * `---\n...\n---\n\n<body>\n`, the same delimiter rule as buildVaultMarkdown and
 * applyFrontmatterUpdates.
 */
import {
  normalizeVaultSource,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from "./parse-frontmatter";

export function replaceVaultBody(source: string, nextBody: string): string {
  // With a BOM present, `raw.startsWith("---")` is false and the file is saved with
  // **the entire frontmatter block gone** — relations and kind lost with it. This
  // path first became reachable on 2026-07-28, when the parser learned to read
  // BOM/CRLF and such documents actually became nodes.
  //
  // Restore whatever line endings and BOM the original file used: reading
  // convenience is not a reason to turn somebody's whole file into a diff.
  const shape = readVaultSourceShape(source);
  const raw = normalizeVaultSource(source);
  const body = nextBody.replace(/^\s+/, "").replace(/\s+$/, "");
  const emit = (text: string) => restoreVaultSourceShape(text, shape);
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      // The frontmatter block is raw[0 .. end+4) = `---\n...\n---`, closing --- included.
      const frontmatter = raw.slice(0, end + 4);
      return emit(body === "" ? `${frontmatter}\n` : `${frontmatter}\n\n${body}\n`);
    }
  }
  return body === "" ? "" : emit(`${body}\n`);
}
