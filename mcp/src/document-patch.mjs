import { buildMarkdown, parseFrontmatter } from './parser.mjs';

const GRAPH_ARRAY_KEYS = new Set([
  'domains', 'capabilities', 'elements', 'dependencies', 'depends_on',
  'relates', 'contains', 'describes', 'broader',
]);

function normalizeDocumentRelationRefs(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const value of values) {
    if (typeof value !== 'string') { passthrough.push(value); continue; }
    const ref = value.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref); refs.push(ref);
  }
  refs.sort((left, right) => left.localeCompare(right, 'en'));
  return [...refs, ...passthrough];
}

/**
 * Pure exact-byte preview for the existing MCP update writer. It deliberately reconstructs
 * frontmatter through the canonical parser/serializer, just as the writer already does: comments
 * and original spacing are normalized, while parsed unknown fields and an untouched body survive.
 * Supplying a writer-minted UID is explicit; this function never invents identity or writes a file.
 * @param {{rawBefore: string, frontmatterPatch?: Record<string, unknown>, body?: string, mintedUid?: string}} input
 * @returns {{status: 'unavailable', reason: 'writer_minted_uid_required'} | {status: 'available', frontmatter: Record<string, unknown>, body: string, markdown: string}}
 */
export function previewDocumentPatch({ rawBefore, frontmatterPatch, body, mintedUid }) {
  if (typeof rawBefore !== 'string') throw new Error('rawBefore must be a string.');
  if (frontmatterPatch !== undefined && (frontmatterPatch === null || typeof frontmatterPatch !== 'object' || Array.isArray(frontmatterPatch))) {
    throw new Error('frontmatterPatch must be an object when supplied.');
  }
  if (body !== undefined && typeof body !== 'string') throw new Error('body must be a string when supplied.');
  if (mintedUid !== undefined && (typeof mintedUid !== 'string' || !mintedUid.trim())) throw new Error('mintedUid must be a non-empty string when supplied.');
  const parsed = parseFrontmatter(rawBefore);
  const frontmatter = { ...parsed.frontmatter };
  for (const [key, value] of Object.entries(frontmatterPatch ?? {})) {
    if (value === null) delete frontmatter[key];
    else if (value !== undefined) frontmatter[key] = GRAPH_ARRAY_KEYS.has(key) && Array.isArray(value)
      ? normalizeDocumentRelationRefs(value) : value;
  }
  if (typeof frontmatter.kind === 'string' && frontmatter.kind.trim()
    && !(typeof frontmatter.uid === 'string' && frontmatter.uid.trim()) && mintedUid === undefined) {
    return { status: 'unavailable', reason: 'writer_minted_uid_required' };
  }
  if (mintedUid !== undefined) frontmatter.uid = mintedUid;
  const nextBody = body === undefined ? parsed.body : body;
  return { status: 'available', frontmatter, body: nextBody, markdown: buildMarkdown({ frontmatter, body: nextBody }) };
}
