// evidence-drift — does the meaning still stand on the code it cites?
//
// A concept document names its implementation (`path:`, and its `elements:` name theirs).
// When those files change after the document was last touched, the recorded meaning stands
// on moved ground: the cognitive-diff probe (2026-09-13) found this the one fact that cut a
// reader's missed impacts by 75%. This module states it per concept from Git alone, in the
// same four words the desktop app uses, so an agent asking `validate_vault` and a person on
// the analysis brief read the same verdicts. A missing time is unknown, never current.

const CONCEPT_KINDS = new Set(['domain', 'capability', 'element']);
const ONTOLOGY_SLUG_PREFIXES = ['capabilities/', 'domains/', 'elements/', 'documents/'];

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Concept inputs from vault docs: own `path:` plus the `path:` of every listed element. */
export function evidenceConceptsFromDocs(docs = []) {
  const pathBySlug = new Map();
  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const slug = asString(fm.slug) ?? asString(doc?.slug);
    const path = asString(fm.path);
    if (slug && path) pathBySlug.set(slug, path);
  }
  const out = [];
  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const kind = asString(fm.kind);
    if (!kind || !CONCEPT_KINDS.has(kind)) continue;
    const slug = asString(fm.slug) ?? asString(doc?.slug);
    if (!slug) continue;
    const docPath = asString(doc?.relativePath) ?? `${asString(doc?.slug) ?? slug}.md`;
    const paths = new Set();
    const own = pathBySlug.get(slug);
    if (own) paths.add(own);
    const elements = Array.isArray(fm.elements) ? fm.elements : [];
    for (const element of elements) {
      const ref = asString(element);
      if (!ref) continue;
      const elementPath = pathBySlug.get(ref);
      if (elementPath) paths.add(elementPath);
      else if (!ONTOLOGY_SLUG_PREFIXES.some((prefix) => ref.startsWith(prefix)) && ref.includes('/')) paths.add(ref);
    }
    out.push({ slug, kind, docPath, evidencePaths: [...paths] });
  }
  return out;
}

function toMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Per concept: `current` (every cited path exists and none changed after the document),
 * `stale` (a cited path changed after the document), `missing` (a cited path is gone),
 * `unknown` (nothing cited, or a change time the walk could not supply).
 */
export function resolveEvidenceStates(concepts, changes) {
  const states = { current: [], stale: [], missing: [], unknown: [] };
  for (const concept of concepts) {
    if (!concept.evidencePaths?.length || !concept.docPath) {
      states.unknown.push({ slug: concept.slug, kind: concept.kind, reason: 'no-evidence' });
      continue;
    }
    const doc = changes.get(concept.docPath);
    const docMs = toMs(doc?.lastChangedAt ?? null);
    let verdict = 'current';
    const moved = [];
    const gone = [];
    for (const path of concept.evidencePaths) {
      const change = changes.get(path);
      if (!change) {
        verdict = 'unknown';
        break;
      }
      if (!change.exists) {
        gone.push(path);
        continue;
      }
      if (docMs == null || !change.lastChangedAt) {
        if (verdict === 'current') verdict = 'unknown';
        continue;
      }
      const changeMs = toMs(change.lastChangedAt);
      if (changeMs != null && changeMs > docMs) moved.push({ path, changedAt: change.lastChangedAt });
    }
    if (gone.length) verdict = 'missing';
    else if (moved.length) verdict = 'stale';
    const row = { slug: concept.slug, kind: concept.kind };
    if (verdict === 'stale') states.stale.push({ ...row, docChangedAt: doc?.lastChangedAt ?? null, moved });
    else if (verdict === 'missing') states.missing.push({ ...row, gone });
    else if (verdict === 'unknown') states.unknown.push({ ...row, reason: docMs == null ? 'document-time-unknown' : 'path-time-unknown' });
    else states.current.push(row);
  }
  return states;
}
