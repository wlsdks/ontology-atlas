import {
  normalizeVaultSource,
  readFrontmatterEntry,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from '@/shared/lib/parse-frontmatter';

/** Patches frontmatter keys in place, keeping body, comments and key order; shared by local edits and agent proposals. */

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
  // BOM and CRLF are normalized and restored, or a `\r` key would be appended as a duplicate.
  const shape = readVaultSourceShape(source);
  const raw = normalizeVaultSource(source);
  let fmLines: string[] = [];
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      fmLines = raw.slice(4, end).split('\n');
      // The serializer re-adds the separator, so leading newlines are stripped.
      body = raw.slice(end + 4).replace(/^(\r?\n)+/, '');
    }
  }
  const updatedKeys = new Set<string>();
  const nextLines: string[] = [];
  // A replaced or deleted key's block-style item lines (`  - a`) are dropped with it.
  let swallowingBlock = false;
  for (const line of fmLines) {
    if (!line.trim()) {
      if (!swallowingBlock) nextLines.push(line);
      continue;
    }
    if (/^\s+\S/.test(line)) {
      // A retained key keeps its block, and `  child: 1` is never taken for a top-level key.
      if (!swallowingBlock) nextLines.push(line);
      continue;
    }
    swallowingBlock = false;
    const entry = readFrontmatterEntry(line);
    if (!entry) {
      nextLines.push(line);
      continue;
    }
    const { key } = entry;
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      nextLines.push(line);
      continue;
    }
    updatedKeys.add(key);
    swallowingBlock = entry.value === '' || /^[|>](?:[1-9][-+]?|[-+][1-9]?)?$/.test(entry.value);
    const value = updates[key];
    if (value === null) continue; // delete
    nextLines.push(`${serializeKey(key)}: ${serializeFrontmatterValue(value)}`);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (updatedKeys.has(key)) continue;
    if (value === null) continue;
    nextLines.push(`${serializeKey(key)}: ${serializeFrontmatterValue(value)}`);
  }
  // No keys left: omit the frontmatter block.
  if (nextLines.every((l) => l.trim() === '')) {
    return restoreVaultSourceShape(body, shape);
  }
  return restoreVaultSourceShape(
    `---\n${nextLines.join('\n')}\n---\n\n${body}`,
    shape,
  );
}

function serializeKey(key: string): string {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(key) ? `"${escapeQuoted(key)}"` : key;
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
    // Inline one-level object, the form `parseFrontmatter` round-trips.
    const entries = Object.entries(v).map(([k, val]) => {
      let serialized: string;
      if (typeof val === 'boolean') serialized = val ? 'true' : 'false';
      else if (typeof val === 'number') serialized = String(val);
      else serialized = needsQuote(val) ? `"${escapeQuoted(val)}"` : val;
      return `${serializeKey(k)}: ${serialized}`;
    });
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

/*
 * Newline and quote characters force quoting, and newlines are escaped (`unquote` restores
 * them), or a value could inject keys. Four writers must agree on this rule.
 */
function needsQuote(s: string): boolean {
  if (/[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s)) return true;
  // Boolean- and number-shaped strings are quoted, or they read back retyped.
  return s === 'true' || s === 'false' || (s !== '' && !Number.isNaN(Number(s)));
}

/** Folds newlines to the two-character `\n` escape. */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

