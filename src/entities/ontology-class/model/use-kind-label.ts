'use client';

import { useTranslations } from 'next-intl';

const KNOWN_KINDS = ['project', 'domain', 'capability', 'element', 'document', 'unknown'] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];

function isKnown(kind: string): kind is KnownKind {
  return (KNOWN_KINDS as ReadonlyArray<string>).includes(kind);
}

/**
 * Locale-aware ontology kind label resolver.
 *
 * Returns a `(kind: string) => string` function that maps the canonical
 * kind id (`project` / `domain` / `capability` / `element` / `document` /
 * `unknown`) to the localized display label. Unknown kinds (e.g. user-
 * defined custom kinds) fall through to the raw kind string so we never
 * render an empty chip.
 *
 * Use this hook from any client component that renders a kind label —
 * tree chips, ego graph, search results, builder palette, inspector,
 * insights breakdown. The pure `getOntologyKindLabel` is kept for vault
 * data / non-i18n contexts (tests, build scripts).
 */
export function useOntologyKindLabel() {
  const t = useTranslations('kinds');
  return (kind: string): string => {
    if (isKnown(kind)) return t(kind);
    return kind;
  };
}
