/**
 * Writes a vault node to Markdown for fixtures that plant a vault on disk. Key order is the order
 * of `frontmatter`; `null` and `undefined` values are skipped. The quoting must agree with the
 * reader in `../parse-frontmatter.mjs`, which `node-markdown.test.mjs` proves by round trip.
 */

const NEEDS_QUOTE = /[:,#[\]"'{}&|*!%@`\n\t]|^\s|\s$/;

function escapeQuoted(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function needsQuote(text) {
  if (NEEDS_QUOTE.test(text)) return true;
  // A string the reader would re-type ('true', '2026') is quoted, or it returns as a boolean or number.
  return text === 'true' || text === 'false' || (text !== '' && !Number.isNaN(Number(text)));
}

function serializeKey(key) {
  return NEEDS_QUOTE.test(key) ? `"${escapeQuoted(key)}"` : key;
}

function serializeValue(value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === 'string' && needsQuote(item) ? `"${escapeQuoted(item)}"` : String(item)));
    return `[${items.join(', ')}]`;
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entry]) => `${serializeKey(key)}: ${serializeValue(entry)}`);
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(value) ? `"${escapeQuoted(value)}"` : value;
}

function serializeMultiline(key, text) {
  const lines = text.split('\n');
  const body = lines.map((line) => (line === '' ? '' : `  ${line}`)).join('\n');
  const firstContent = lines.find((line) => line !== '');
  const indent = firstContent !== undefined && /^\s/.test(firstContent) ? '2' : '';
  return `${key}: |${indent}-\n${body}`;
}

export function buildNodeMarkdown({ frontmatter, body = '' }) {
  const lines = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.includes('\n')) {
      lines.push(serializeMultiline(serializeKey(key), value));
    } else {
      lines.push(`${serializeKey(key)}: ${serializeValue(value)}`);
    }
  }
  const cleanBody = body ? body.replace(/^\n+/, '') : '';
  return `---\n${lines.join('\n')}\n---\n\n${cleanBody}`;
}
