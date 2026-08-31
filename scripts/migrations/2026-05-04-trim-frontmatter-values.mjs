// Reference migration — trims trailing whitespace from frontmatter scalars.
//
// e.g. `kind: project    ` → `kind: project`
//     `title: Foo     `  → `title: Foo`
//
// Scope: only `key: value` lines inside the frontmatter block (between the `---`).
// The body is untouched. Inline lists, inline objects, and dash items of block lists
// are conservatively skipped (their indentation may be deliberate).
//
// Idempotent — running it twice gives the same result.

export const id = "2026-05-04-trim-frontmatter-values";
export const description =
  "Trim trailing whitespace from frontmatter scalar lines.";

/**
 * @param {{ path: string; raw: string; relativePath: string }} file
 * @returns {{ raw: string } | null}
 */
export function migrate(file) {
  const { raw } = file;
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;

  const block = raw.slice(0, end);
  const rest = raw.slice(end);

  const lines = block.split("\n");
  let changed = false;
  const transformed = lines.map((line, idx) => {
    if (idx === 0) return line; // leading ---
    // dash list item — leave indentation as-is
    if (/^\s+-\s/.test(line)) return line;
    // `key: value` — trim trailing whitespace from the right side only
    const m = line.match(/^([^:]*:\s*)(.*?)(\s+)$/);
    if (!m) return line;
    // m[3] is the trailing whitespace; rebuild without it
    const next = `${m[1]}${m[2]}`;
    if (next !== line) changed = true;
    return next;
  });

  if (!changed) return null;
  return { raw: transformed.join("\n") + rest };
}
