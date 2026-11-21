/**
 * Replaces only the prose body of a node's markdown, leaving the frontmatter untouched (the inverse of
 * `parseFrontmatter`; `applyFrontmatterUpdates` does the opposite). With no frontmatter block the
 * whole file is body. Surrounding whitespace is trimmed and the result is `---\n...\n---\n\n<body>\n`,
 * the delimiter rule of buildVaultMarkdown.
 */
import {
  normalizeVaultSource,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from "./parse-frontmatter";

export function replaceVaultBody(source: string, nextBody: string): string {
  // With a BOM, `raw.startsWith("---")` is false and the frontmatter would be lost; restore the
  // original line endings and BOM so the file does not become a whole-file diff.
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
