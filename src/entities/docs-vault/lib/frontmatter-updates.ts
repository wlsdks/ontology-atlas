import {
  normalizeVaultSource,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from '@/shared/lib/parse-frontmatter';

/**
 * Patches frontmatter keys in place, preserving everything else — body, comments,
 * and key order.
 *
 * **Why this lives in `entities`**: two paths write to the vault — a person
 * editing a local vault (`docs-vault-local`) and applying an agent's proposal
 * (`vault-agent`). Two rules writing one file means two formats in the git diff
 * and bugs that only manifest on one of the paths. FSD forbids feature→feature
 * imports, so the shared rule moves one layer down.
 */

export type FrontmatterUpdateValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean>
  | null;

export function applyFrontmatterUpdates(
  source: string,
  updates: Record<string, FrontmatterUpdateValue>,
): string {
  // BOM and CRLF sources are read by the same rule and restored to their original
  // shape on save (same contract as `replaceVaultBody`). Without CRLF
  // normalization a `\r` stays at the end of the key line, `key in updates` misses,
  // and **a duplicate key is appended** instead of updated. With a BOM the
  // frontmatter block is not found at all and everything is rewritten.
  const shape = readVaultSourceShape(source);
  const raw = normalizeVaultSource(source);
  let fmLines: string[] = [];
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      fmLines = raw.slice(4, end).split('\n');
      // Strip every leading newline: the serializer re-adds `---\n...\n---\n\n`,
      // so the body must start without one or the separator doubles.
      body = raw.slice(end + 4).replace(/^(\r?\n)+/, '');
    }
  }
  const updatedKeys = new Set<string>();
  const nextLines: string[] = [];
  // Are we swallowing the leftover block-style lines (`  - item`) of a key we just
  // replaced or deleted? YAML writes the same array inline (`key: [a, b]`) or as a
  // block (`key:` + `  - a`), and this function replaces only the key line — so a
  // block-style key left its old item lines sitting under the new inline value.
  // Our parser ignores them, so the screen looked fine while the file on disk no
  // longer read as standard YAML and the git diff carried ghost lines. In a product
  // where the vault is the source of truth that is a defect. The starter writes
  // block style (`capabilities:` + `  - …`), so this reproduces on the first-user
  // path (confirmed by walkthrough, 2026-07-26).
  let swallowingBlock = false;
  for (const line of fmLines) {
    // An indented line belongs to the preceding key's block value — drop it with the key.
    if (/^\s+\S/.test(line)) {
      // A retained key keeps its block value. This also stops `  child: 1` being
      // mistaken for a top-level key and replaced.
      if (!swallowingBlock) nextLines.push(line);
      continue;
    }
    swallowingBlock = false;
    const idx = line.indexOf(':');
    if (idx === -1) {
      nextLines.push(line);
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!(key in updates)) {
      nextLines.push(line);
      continue;
    }
    updatedKeys.add(key);
    swallowingBlock = true;
    const value = updates[key];
    if (value === null) continue; // delete
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (updatedKeys.has(key)) continue;
    if (value === null) continue;
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  // No keys left — omit the frontmatter section entirely.
  if (nextLines.every((l) => l.trim() === '')) {
    return restoreVaultSourceShape(body, shape);
  }
  return restoreVaultSourceShape(
    `---\n${nextLines.join('\n')}\n---\n\n${body}`,
    shape,
  );
}

function serializeFrontmatterValue(
  v: Exclude<FrontmatterUpdateValue, null>,
): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${escapeQuoted(s)}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    // Inline one-level object — `{ x: 100, y: 200 }`. `parseFrontmatter` round-trips
    // this same form (parser.test.mjs 'inline object' case).
    const entries = Object.entries(v).map(([k, val]) => {
      let serialized: string;
      if (typeof val === 'boolean') serialized = val ? 'true' : 'false';
      else if (typeof val === 'number') serialized = String(val);
      else serialized = needsQuote(val) ? `"${escapeQuoted(val)}"` : val;
      return `${k}: ${serialized}`;
    });
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

/*
 * Does this value need quoting — **four places must agree on the answer.**
 *
 * Reviewed and reproduced 2026-08-16: newline was missing from the rule. That one
 * character destroys the whole frontmatter block — `note\nkind: element` **changes
 * the node's kind**, and `note\n---\nx: 1` ends the frontmatter there, dropping the
 * remaining keys into the body. Silently, with no warning.
 *
 * Quoting alone does not help once the line is already broken, so the writer
 * escapes to `\n` and the reader restores it (`unquote`).
 *
 * The single quote joined the rule too: `unquote` strips unmatched quotes from both
 * ends, so an unquoted value like `'map'` reads back as `map`.
 */
function needsQuote(s: string): boolean {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s);
}

/** Makes a value safe inside quotes — newlines fold to `\n`. */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

