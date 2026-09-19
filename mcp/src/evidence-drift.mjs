// evidence-drift — does the meaning still stand on the code it cites?
//
// A concept document names its implementation (`path:`, and its `elements:` name theirs).
// When those files change after the document was last touched, the recorded meaning stands
// on moved ground: the cognitive-diff probe (2026-09-13) found this the one fact that cut a
// reader's missed impacts by 75%. This module states it per concept from Git alone, in the
// same four words the desktop app uses, so an agent asking `validate_vault` and a person on
// the analysis brief read the same verdicts. A missing time is unknown, never current.

import { judgeEvidence } from './evidence-verdict.mjs';

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

export function resolveEvidenceStates(concepts, changes) {
  const states = { current: [], stale: [], missing: [], unknown: [] };
  for (const concept of concepts) {
    const doc = changes.get(concept.docPath);
    const { verdict, reason, moved, folders, gone } = judgeEvidence({
      docChangedAt: concept.docPath ? (doc?.lastChangedAt ?? null) : null,
      entries: (concept.evidencePaths ?? []).map((path) => ({ path, change: changes.get(path) ?? null })),
    });
    const row = { slug: concept.slug, kind: concept.kind };
    if (verdict === 'stale') states.stale.push({ ...row, docChangedAt: doc?.lastChangedAt ?? null, moved });
    else if (verdict === 'missing') states.missing.push({ ...row, gone });
    else if (verdict === 'unknown') {
      states.unknown.push(
        reason === 'folder-only'
          ? { ...row, reason, docChangedAt: doc?.lastChangedAt ?? null, folders }
          : { ...row, reason },
      );
    } else states.current.push(row);
  }
  const bySlug = (a, b) => a.slug.localeCompare(b.slug);
  for (const key of ['current', 'stale', 'missing', 'unknown']) states[key].sort(bySlug);
  return states;
}
