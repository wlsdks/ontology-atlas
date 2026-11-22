// Finds the starter examples `init` wrote once a vault has real nodes of the same kind.

import {
  STARTER_EXAMPLE_BODY_MARKERS,
  STARTER_EXAMPLE_SLUGS,
  starterExampleNodeMessage,
} from '../construction/construction-rules.mjs';
import { folderForKind } from '../schema.mjs';

const STARTER_EXAMPLE_KINDS = new Set(Object.keys(STARTER_EXAMPLE_SLUGS));

/**
 * Is this one of the examples `init` wrote to be copied? The three template
 * addresses match outright. Otherwise both an `example-` slug tail and an
 * "Example" title are required: either alone would accuse a real node, and a
 * real node that is about examples and named both ways is an accepted false
 * positive. The body is not consulted, so rewriting the prose but keeping the
 * name still counts.
 */
export function isStarterExampleNode({ slug, kind, title }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  if (!address) return false;
  if (typeof kind === 'string' && STARTER_EXAMPLE_SLUGS[kind.trim()] === address) return true;
  if (Object.values(STARTER_EXAMPLE_SLUGS).includes(address)) return true;
  const tail = address.split('/').pop() ?? '';
  if (!tail.startsWith('example-')) return false;
  return String(title ?? '').trim().startsWith('Example');
}

/** Does this body still carry the sentences only the untouched starter has? */
function hasUntouchedStarterBody(body) {
  const text = String(body ?? '').toLowerCase();
  return STARTER_EXAMPLE_BODY_MARKERS.every((marker) => text.includes(marker.toLowerCase()));
}

/**
 * Pure: the caller says which real sibling exists (a whole-vault question); `realSlug` may be null
 * when unknown.
 */
export function starterExampleFinding({ slug, kind, title, body, realSlug = null }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  const nodeKind = typeof kind === 'string' ? kind.trim() : '';
  if (!STARTER_EXAMPLE_KINDS.has(nodeKind)) return null;
  if (!isStarterExampleNode({ slug: address, kind: nodeKind, title })) return null;
  const folder = folderForKind(nodeKind) ?? '';
  return {
    code: 'starter-example-node',
    slug: address,
    key: 'slug',
    refs: realSlug ? [realSlug] : [],
    count: 1,
    message: starterExampleNodeMessage({
      starterSlug: address,
      kind: nodeKind,
      realSlug,
      renameTo: `${folder}<real-name>`,
      untouchedBody: hasUntouchedStarterBody(body),
    }),
  };
}

/**
 * Every starter example a vault has outgrown, for validate_vault and the
 * maintenance plan. Needs only slug, kind and title, so it works on a vault
 * nobody compiled with bodies. `nodes`: iterable of `{ slug, kind, title, body? }`.
 */
export function starterExampleFindings(nodes) {
  // The row keeps its node rather than a copy of it: a cached document reads its
  // body only when asked, and only a starter's body is.
  const rows = [];
  for (const node of nodes ?? []) {
    const kind = typeof node?.kind === 'string' ? node.kind.trim() : '';
    if (!kind) continue;
    rows.push({ node, slug: node.slug, kind, starter: isStarterExampleNode({ slug: node.slug, kind, title: node.title }) });
  }
  const findings = [];
  for (const row of rows) {
    if (!row.starter) continue;
    // Until a real node of the kind exists, the starter is the product's own instructions.
    const sibling = rows.find((other) => other.kind === row.kind && !other.starter);
    if (!sibling) continue;
    const finding = starterExampleFinding({ ...row.node, kind: row.kind, starter: true, realSlug: sibling.slug ?? null });
    if (finding) findings.push(finding);
  }
  return findings.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}
